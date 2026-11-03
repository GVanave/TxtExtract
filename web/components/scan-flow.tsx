"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { CATEGORIES, type CategorySlug } from "@/lib/categories";
import { todayIso } from "@/lib/dates";
import { type Draft, type DraftItem, draftToReceipt, emptyItem, receiptToDraft } from "@/lib/draft";
import { euro, germanDate } from "@/lib/format";
import { prepareImage } from "@/lib/image";
import { LINE_TYPE_LABELS, LINE_TYPES, type LineType, type Receipt, type SavedReceipt } from "@/lib/receipt";
import { SHARPNESS_THRESHOLD } from "@/lib/sharpness";
import { validateReceipt } from "@/lib/validation";

import { AlertIcon, CameraIcon, CheckIcon, PencilIcon, PlusIcon, Spinner, TrashIcon } from "./icons";
import { button, Card, input, Notice } from "./ui";
import { UndoBar } from "./undo-bar";

type Photo = { previewUrl: string | null; name: string };
type Prepared = { photo: Photo; blob: Blob };
type Review = { kind: "review"; photo: Photo; draft: Draft; model: string; attempts: number; raw: unknown };

type Phase =
  | { kind: "pick" }
  | { kind: "blurry"; prepared: Prepared }
  | { kind: "reading"; photo: Photo }
  | Review
  | { kind: "saved"; saved: SavedReceipt };

type ExtractResponse = { receipt: Receipt; raw: unknown; issues: string[]; model: string; attempts: number };

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return (body as { error?: string } | null)?.error ?? "Das hat nicht geklappt. Bitte versuche es noch einmal.";
}

const deviceToday = () => todayIso(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone);

export function ScanFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const [discarded, setDiscarded] = useState<Review | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const release = (photo: Photo) => photo.previewUrl && URL.revokeObjectURL(photo.previewUrl);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setDiscarded(null);
    let prepared: Prepared;
    try {
      const image = await prepareImage(file);
      prepared = { photo: { previewUrl: image.previewUrl, name: image.name }, blob: image.blob };
      if (image.sharpness !== null && image.sharpness < SHARPNESS_THRESHOLD) {
        setPhase({ kind: "blurry", prepared });
        return;
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    await read(prepared);
  }

  async function read({ photo, blob }: Prepared) {
    setPhase({ kind: "reading", photo });
    const form = new FormData();
    form.append("image", blob, photo.name);
    try {
      const response = await fetch("/api/extract", { method: "POST", body: form });
      if (response.status === 401) {
        router.push("/signin");
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as ExtractResponse;
      setPhase({ kind: "review", photo, draft: receiptToDraft(result.receipt, deviceToday()), model: result.model, attempts: result.attempts, raw: result.raw });
    } catch (e) {
      release(photo);
      setPhase({ kind: "pick" });
      setError((e as Error).message || "Das hat nicht geklappt. Bitte versuche es noch einmal.");
    }
  }

  const pickers = (
    <>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="camera-input"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        data-testid="file-input"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );

  if (phase.kind === "saved") {
    return <SavedCard saved={phase.saved} onNext={() => setPhase({ kind: "pick" })} />;
  }

  if (phase.kind === "review") {
    return (
      <ReviewForm
        key={phase.photo.name + phase.model}
        phase={phase}
        onDiscard={(draft) => {
          // No "are you sure?": discard at once, with a few seconds to undo.
          setDiscarded({ ...phase, draft });
          setPhase({ kind: "pick" });
        }}
        onSaved={(saved) => {
          release(phase.photo);
          setPhase({ kind: "saved", saved });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {pickers}
      {error && <Notice tone="danger" title="Das hat nicht geklappt">{error}</Notice>}

      {phase.kind === "reading" && (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          {phase.photo.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={phase.photo.previewUrl} alt="" className="h-48 w-auto rounded-lg object-contain opacity-60" />
          )}
          <div className="flex items-center gap-3 text-brand">
            <Spinner size={24} />
            <span className="text-lg font-semibold">Kassenbon wird gelesen …</span>
          </div>
          <p className="max-w-xs text-muted">Das dauert meistens 5 bis 15 Sekunden.</p>
        </Card>
      )}

      {phase.kind === "blurry" && (
        <Card className="space-y-4 text-center">
          {phase.prepared.photo.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={phase.prepared.photo.previewUrl} alt="Dein Foto" className="mx-auto h-48 w-auto rounded-lg object-contain" />
          )}
          <div className="flex items-center justify-center gap-2 text-warn">
            <AlertIcon size={22} />
            <h2 className="text-lg font-semibold">Das Foto ist unscharf</h2>
          </div>
          <p className="text-muted">Mit einem scharfen Foto wird der Kassenbon besser erkannt. Halte das Handy ruhig und sorge für gutes Licht.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className={`${button.primary} flex-1`}
              onClick={() => {
                release(phase.prepared.photo);
                setPhase({ kind: "pick" });
                cameraInput.current?.click();
              }}
            >
              <CameraIcon size={22} /> Neues Foto machen
            </button>
            <button type="button" className={`${button.secondary} flex-1`} onClick={() => void read(phase.prepared)}>
              Trotzdem verwenden
            </button>
          </div>
        </Card>
      )}

      {phase.kind === "pick" && (
        <>
          <Card className="space-y-4 py-8 text-center">
            <button type="button" className={`${button.primary} w-full py-5 text-xl`} onClick={() => cameraInput.current?.click()}>
              <CameraIcon size={28} /> Kassenbon fotografieren
            </button>
            <button type="button" className={`${button.ghost} underline underline-offset-4`} onClick={() => fileInput.current?.click()}>
              oder ein Foto bzw. PDF hochladen
            </button>
          </Card>
          <Link href="/manual" className={`${button.secondary} w-full`}>
            <PencilIcon size={20} /> Kein Kassenbon? Betrag eintippen
          </Link>
          <ul className="space-y-2 text-base text-muted">
            {["Kassenbon flach hinlegen", "Den ganzen Kassenbon ins Bild nehmen", "Gutes Licht, keine Schatten"].map((tip) => (
              <li key={tip} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
                <CheckIcon size={20} className="shrink-0 text-brand" /> {tip}
              </li>
            ))}
          </ul>
        </>
      )}

      {discarded && (
        <UndoBar
          message="Scan verworfen."
          onUndo={() => {
            setPhase(discarded);
            setDiscarded(null);
          }}
          onClose={() => {
            release(discarded.photo);
            setDiscarded(null);
          }}
        />
      )}
    </div>
  );
}

// --- Check before saving ---------------------------------------------------------------------------------

function ReviewForm({ phase, onDiscard, onSaved }: { phase: Review; onDiscard: (draft: Draft) => void; onSaved: (saved: SavedReceipt) => void }) {
  const [draft, setDraft] = useState<Draft>(phase.draft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<SavedReceipt | null>(null);

  const { receipt, problems } = useMemo(() => draftToReceipt(draft), [draft]);
  const issues = useMemo(() => (receipt ? validateReceipt(receipt) : []), [receipt]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setItem = (key: string, patch: Partial<DraftItem>) =>
    setDraft((d) => ({ ...d, items: d.items.map((it) => (it.key === key ? { ...it, ...patch } : it)) }));

  async function save(allowDuplicate = false) {
    if (!receipt) return;
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt, model: phase.model, imageName: phase.photo.name, rawExtraction: phase.raw, allowDuplicate }),
      });
      if (response.status === 409) {
        setDuplicate(((await response.json()) as { duplicate: SavedReceipt }).duplicate);
        return;
      }
      if (!response.ok) throw new Error(await readError(response));
      onSaved(((await response.json()) as { saved: SavedReceipt }).saved);
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const buttons = (
    <SaveButtons saving={saving} canSave={!!receipt} hasIssues={issues.length > 0} onSave={() => save()} onDiscard={() => onDiscard(draft)} />
  );

  return (
    <div className="space-y-4 pb-28 sm:pb-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="lg:sticky lg:top-20 lg:self-start">
          {phase.photo.previewUrl ? (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center font-medium text-brand lg:hidden">
                <span className="group-open:hidden">Foto anzeigen</span>
                <span className="hidden group-open:inline">Foto ausblenden</span>
              </summary>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={phase.photo.previewUrl} alt="Foto vom Kassenbon" className="mt-3 max-h-[70vh] w-full rounded-lg object-contain lg:mt-0" />
            </details>
          ) : (
            <p className="text-muted">📄 {phase.photo.name}</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Geschäft" className="col-span-2 sm:col-span-1">
                <input className={input} value={draft.store_name} onChange={(e) => set({ store_name: e.target.value })} />
              </Field>
              <Field label="Datum" className="col-span-2 sm:col-span-1">
                <input type="date" className={input} value={draft.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Summe (€)" className="col-span-2">
                <input
                  inputMode="decimal"
                  className={`${input} tabular text-right text-xl font-bold`}
                  value={draft.total}
                  onChange={(e) => set({ total: e.target.value })}
                  aria-label="Summe"
                />
              </Field>
            </div>
            <details className="mt-3">
              <summary className="flex min-h-11 cursor-pointer items-center text-muted">Mehr Angaben (Uhrzeit, Zahlung)</summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label="Uhrzeit">
                  <input type="time" className={input} value={draft.time} onChange={(e) => set({ time: e.target.value })} />
                </Field>
                <Field label="Bezahlt mit">
                  <input className={input} value={draft.payment_method} onChange={(e) => set({ payment_method: e.target.value })} />
                </Field>
              </div>
            </details>
          </Card>

          <CheckSummary problems={problems} issues={issues} receipt={receipt} />

          {duplicate && (
            <Notice tone="warn" title="Dieser Einkauf ist schon gespeichert">
              {duplicate.store_name}, {germanDate(duplicate.date)}, {euro(duplicate.total)}.{" "}
              <button type="button" className="min-h-11 font-semibold underline" onClick={() => save(true)}>
                Trotzdem speichern
              </button>
            </Notice>
          )}
          {saveError && <Notice tone="danger" title="Speichern hat nicht geklappt">{saveError}</Notice>}

          <div className="hidden gap-3 sm:flex">{buttons}</div>
        </div>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Produkte <span className="font-normal text-muted">({draft.items.length})</span>
          </h2>
          <button type="button" className={button.ghost} onClick={() => set({ items: [...draft.items, emptyItem()] })}>
            <PlusIcon size={18} /> Zeile hinzufügen
          </button>
        </div>
        <ul className="divide-y divide-line">
          {draft.items.map((item, index) => (
            <ItemRow
              key={item.key}
              item={item}
              index={index}
              onChange={(patch) => setItem(item.key, patch)}
              onRemove={() => set({ items: draft.items.filter((it) => it.key !== item.key) })}
            />
          ))}
        </ul>
      </Card>

      {/* Phone: the buttons stay reachable above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 p-3 backdrop-blur sm:hidden">
        <div className="flex gap-3">{buttons}</div>
      </div>
    </div>
  );
}

function SaveButtons(props: { saving: boolean; canSave: boolean; hasIssues: boolean; onSave: () => void; onDiscard: () => void }) {
  return (
    <>
      <button type="button" className={`${button.primary} flex-1`} disabled={!props.canSave || props.saving} onClick={props.onSave}>
        {props.saving ? <Spinner size={20} /> : <CheckIcon size={20} />}
        {props.hasIssues ? "Trotzdem speichern" : "Speichern"}
      </button>
      <button type="button" className={button.secondary} disabled={props.saving} onClick={props.onDiscard}>
        Verwerfen
      </button>
    </>
  );
}

/** One plain sentence: does it add up? */
function CheckSummary({ problems, issues, receipt }: { problems: string[]; issues: string[]; receipt: Receipt | null }) {
  if (problems.length) {
    return (
      <Notice tone="danger" title="Bitte ergänzen">
        <ul className="list-disc pl-5">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
      </Notice>
    );
  }
  if (issues.length) {
    return (
      <Notice tone="warn" title="Bitte prüfen">
        <ul className="list-disc pl-5">{issues.map((i) => <li key={i}>{i}</li>)}</ul>
        <p className="mt-2">Vergleiche die Beträge mit dem Foto. Du kannst auch so speichern, der Einkauf wird dann zum Prüfen markiert.</p>
      </Notice>
    );
  }
  const sum = receipt ? receipt.line_items.reduce((s, i) => s + i.total_price, 0) : 0;
  return <Notice tone="ok" title={`Alles stimmt: Die Preise ergeben zusammen ${euro(sum)}.`} />;
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const small = "min-h-11 w-full rounded-md border border-line bg-surface px-2 py-2 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

/** Product, price and category; everything technical sits behind "Details". */
function ItemRow({ item, index, onChange, onRemove }: { item: DraftItem; index: number; onChange: (patch: Partial<DraftItem>) => void; onRemove: () => void }) {
  const negative = item.line_type === "discount" || item.line_type === "deposit_return";
  const line = `Zeile ${index + 1}`;
  return (
    <li className="py-3" data-testid="item-row">
      <div className="flex items-center gap-2">
        <input
          className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-lg font-medium outline-none hover:border-line focus:border-brand focus:bg-surface"
          value={item.name}
          placeholder="Produkt"
          aria-label={`${line} Produkt`}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <input
          inputMode="decimal"
          className={`tabular min-h-11 w-28 rounded-md border border-line bg-surface px-2 text-right text-lg font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ${negative ? "text-ok" : ""}`}
          value={item.total_price}
          placeholder="0,00"
          aria-label={`${line} Preis`}
          onChange={(e) => onChange({ total_price: e.target.value })}
        />
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" aria-label={`${line} entfernen`} onClick={onRemove}>
          <TrashIcon size={20} />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 pl-2 pr-[3.25rem]">
        {item.line_type === "product" ? (
          <>
            <select
              className={`${small} flex-1 ${item.category ? "" : "text-muted"}`}
              value={item.category}
              aria-label={`${line} Kategorie`}
              onChange={(e) => onChange({ category: e.target.value as CategorySlug | "", category_source: "user" })}
            >
              <option value="">Keine Kategorie</option>
              {CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            {item.category_source === "memory" && (
              <span className="rounded-full bg-brand-soft px-2.5 py-1 text-sm font-medium text-brand-strong" title="Diese Kategorie hast du für dieses Produkt schon einmal gewählt">
                gemerkt
              </span>
            )}
          </>
        ) : (
          <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-muted">{LINE_TYPE_LABELS[item.line_type]}</span>
        )}
      </div>

      <details className="mt-1 pl-2 pr-[3.25rem]">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted">Details</summary>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          <label className="text-sm text-muted">
            Art
            <select className={small} value={item.line_type} aria-label={`${line} Art`} onChange={(e) => onChange({ line_type: e.target.value as LineType })}>
              {LINE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LINE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-muted">
            Menge
            <input inputMode="decimal" className={small} value={item.quantity} aria-label={`${line} Menge`} onChange={(e) => onChange({ quantity: e.target.value })} />
          </label>
          <label className="text-sm text-muted">
            Stückpreis
            <input inputMode="decimal" className={small} value={item.unit_price} aria-label={`${line} Stückpreis`} onChange={(e) => onChange({ unit_price: e.target.value })} />
          </label>
          <label className="text-sm text-muted">
            MwSt.
            <input className={small} value={item.vat_code} aria-label={`${line} MwSt`} onChange={(e) => onChange({ vat_code: e.target.value })} />
          </label>
        </div>
        {item.raw_text && <p className="mt-2 text-sm text-muted">Auf dem Kassenbon: „{item.raw_text}“</p>}
      </details>
    </li>
  );
}

// --- Saved -----------------------------------------------------------------------------------------------

function SavedCard({ saved, onNext }: { saved: SavedReceipt; onNext: () => void }) {
  const products = saved.line_items.filter((i) => i.line_type === "product").length;
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft text-ok">
        <CheckIcon size={34} />
      </div>
      <h2 className="text-2xl font-semibold">Gespeichert</h2>
      <p className="mt-1 text-muted">
        {saved.store_name} · {germanDate(saved.date)} · {products} {products === 1 ? "Produkt" : "Produkte"}
      </p>
      <p className="tabular mt-3 text-4xl font-bold tracking-tight">{euro(saved.total)}</p>
      {saved.needs_review && <p className="mt-2 text-warn">Zum Prüfen markiert: Die Beträge haben nicht ganz zusammengepasst.</p>}
      <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
        <button type="button" className={`${button.primary} w-full`} onClick={onNext}>
          <CameraIcon size={22} /> Nächsten Kassenbon scannen
        </button>
        <Link href={`/receipts/${saved.id}`} className={`${button.secondary} w-full`}>
          Einkauf ansehen
        </Link>
      </div>
    </Card>
  );
}
