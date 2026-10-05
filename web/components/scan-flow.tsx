"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import { type Draft, type DraftItem, draftToReceipt, emptyItem, receiptToDraft } from "@/lib/draft";
import { euro, germanDate } from "@/lib/format";
import { prepareImage } from "@/lib/image";
import { LINE_TYPE_LABELS, LINE_TYPES, type LineType, type Receipt, type SavedReceipt } from "@/lib/receipt";
import { validateReceipt } from "@/lib/validation";

import { CameraIcon, CheckIcon, ImageIcon, PlusIcon, ReceiptIcon, Spinner, TrashIcon } from "./icons";
import { button, Card, input, Notice } from "./ui";

type Photo = { previewUrl: string | null; name: string };

type Phase =
  | { kind: "pick" }
  | { kind: "reading"; photo: Photo }
  | { kind: "review"; photo: Photo; draft: Draft; model: string; attempts: number }
  | { kind: "saved"; saved: SavedReceipt };

type ExtractResponse = { receipt: Receipt; issues: string[]; model: string; attempts: number };

async function readError(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return (body as { error?: string } | null)?.error ?? `Request failed (${response.status}).`;
}

export function ScanFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    if ((phase.kind === "reading" || phase.kind === "review") && phase.photo.previewUrl) {
      URL.revokeObjectURL(phase.photo.previewUrl);
    }
    setPhase({ kind: "pick" });
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    let photo: Photo;
    let blob: Blob;
    try {
      const prepared = await prepareImage(file);
      photo = { previewUrl: prepared.previewUrl, name: prepared.name };
      blob = prepared.blob;
    } catch (e) {
      setError((e as Error).message);
      return;
    }
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
      setPhase({ kind: "review", photo, draft: receiptToDraft(result.receipt), model: result.model, attempts: result.attempts });
    } catch (e) {
      if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      setPhase({ kind: "pick" });
      setError((e as Error).message || "Could not read the receipt.");
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
        onDiscard={reset}
        onSaved={(saved) => {
          if (phase.photo.previewUrl) URL.revokeObjectURL(phase.photo.previewUrl);
          setPhase({ kind: "saved", saved });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {pickers}
      {error && <Notice tone="danger" title="Couldn't read that receipt">{error}</Notice>}

      {phase.kind === "reading" ? (
        <Card className="flex flex-col items-center gap-4 py-10 text-center">
          {phase.photo.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={phase.photo.previewUrl} alt="" className="h-48 w-auto rounded-lg object-contain opacity-60" />
          )}
          <div className="flex items-center gap-3 text-brand">
            <Spinner size={22} />
            <span className="font-semibold">Reading your receipt…</span>
          </div>
          <p className="max-w-xs text-sm text-muted">Gemini is extracting the items. This usually takes 5–15 seconds.</p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden p-0 sm:p-0">
            <div className="bg-gradient-to-br from-brand-soft to-surface px-5 pb-6 pt-8 text-center sm:px-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand text-on-brand shadow-sm">
                <ReceiptIcon size={32} />
              </div>
              <h2 className="text-lg font-semibold">Add a receipt</h2>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Take a photo right after shopping. You can check and correct everything before it is saved.
              </p>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              <button type="button" className={`${button.primary} py-4 text-base`} onClick={() => cameraInput.current?.click()}>
                <CameraIcon size={22} /> Take photo
              </button>
              <button type="button" className={`${button.secondary} py-4 text-base`} onClick={() => fileInput.current?.click()}>
                <ImageIcon size={22} /> Upload photo or PDF
              </button>
            </div>
          </Card>
          <ul className="grid gap-2 text-sm text-muted sm:grid-cols-3">
            {["Lay the receipt flat", "Fill the frame, avoid shadows", "Long receipts: one photo is fine"].map((tip) => (
              <li key={tip} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                <CheckIcon size={16} className="shrink-0 text-brand" /> {tip}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// --- Review ----------------------------------------------------------------------------------------------

function ReviewForm({
  phase,
  onDiscard,
  onSaved,
}: {
  phase: Extract<Phase, { kind: "review" }>;
  onDiscard: () => void;
  onSaved: (saved: SavedReceipt) => void;
}) {
  const [draft, setDraft] = useState<Draft>(phase.draft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<SavedReceipt | null>(null);

  const { receipt, problems } = useMemo(() => draftToReceipt(draft), [draft]);
  const issues = useMemo(() => (receipt ? validateReceipt(receipt) : []), [receipt]);
  const itemsSum = receipt ? receipt.line_items.reduce((s, i) => s + i.total_price, 0) : null;

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
        body: JSON.stringify({ receipt, model: phase.model, imageName: phase.photo.name, allowDuplicate }),
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

  return (
    <div className="space-y-4 pb-24 sm:pb-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Card className="lg:sticky lg:top-20 lg:self-start">
          {phase.photo.previewUrl ? (
            <details className="group" open>
              <summary className="cursor-pointer list-none text-sm font-medium text-muted lg:hidden">
                <span className="group-open:hidden">Show photo</span>
                <span className="hidden group-open:inline">Hide photo</span>
              </summary>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={phase.photo.previewUrl} alt="Receipt photo" className="mt-3 max-h-[70vh] w-full rounded-lg object-contain lg:mt-0" />
            </details>
          ) : (
            <p className="text-sm text-muted">📄 {phase.photo.name}</p>
          )}
          <p className="mt-3 text-xs text-muted">
            Read by {phase.model}
            {phase.attempts > 1 ? ` · ${phase.attempts} attempts` : ""}
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Store" className="col-span-2 sm:col-span-1">
                <input className={input} value={draft.store_name} onChange={(e) => set({ store_name: e.target.value })} />
              </Field>
              <Field label="Date" className="col-span-2 sm:col-span-1">
                <input type="date" className={input} value={draft.date} onChange={(e) => set({ date: e.target.value })} />
              </Field>
              <Field label="Time">
                <input type="time" className={input} value={draft.time} onChange={(e) => set({ time: e.target.value })} />
              </Field>
              <Field label="Total (€)">
                <input
                  inputMode="decimal"
                  className={`${input} tabular text-right font-semibold`}
                  value={draft.total}
                  onChange={(e) => set({ total: e.target.value })}
                  aria-label="Total"
                />
              </Field>
              <Field label="Payment" className="col-span-2">
                <input className={input} value={draft.payment_method} onChange={(e) => set({ payment_method: e.target.value })} />
              </Field>
            </div>
          </Card>

          <CheckSummary problems={problems} issues={issues} lines={receipt?.line_items.length ?? 0} itemsSum={itemsSum} total={receipt?.total ?? null} />

          {duplicate && (
            <Notice tone="warn" title="This receipt looks already saved">
              {duplicate.store_name} · {germanDate(duplicate.date)} {duplicate.time} · {euro(duplicate.total)}.{" "}
              <button type="button" className="font-semibold underline" onClick={() => save(true)}>
                Save anyway
              </button>
            </Notice>
          )}
          {saveError && <Notice tone="danger" title="Couldn't save">{saveError}</Notice>}

          <div className="hidden gap-3 sm:flex">
            <SaveButtons saving={saving} canSave={!!receipt} hasIssues={issues.length > 0} onSave={() => save()} onDiscard={onDiscard} />
          </div>
        </div>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Items <span className="text-sm font-normal text-muted">({draft.items.length})</span>
          </h2>
          <button type="button" className={button.ghost} onClick={() => set({ items: [...draft.items, emptyItem()] })}>
            <PlusIcon size={16} /> Add line
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

      {/* Phone: actions stay reachable above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 border-t border-line bg-surface/95 p-3 backdrop-blur sm:hidden">
        <div className="flex gap-3">
          <SaveButtons saving={saving} canSave={!!receipt} hasIssues={issues.length > 0} onSave={() => save()} onDiscard={onDiscard} />
        </div>
      </div>
    </div>
  );
}

function SaveButtons(props: { saving: boolean; canSave: boolean; hasIssues: boolean; onSave: () => void; onDiscard: () => void }) {
  return (
    <>
      <button type="button" className={`${button.primary} flex-1`} disabled={!props.canSave || props.saving} onClick={props.onSave}>
        {props.saving ? <Spinner size={18} /> : <CheckIcon size={18} />}
        {props.hasIssues ? "Save for review" : "Save receipt"}
      </button>
      <button type="button" className={button.secondary} disabled={props.saving} onClick={props.onDiscard}>
        Discard
      </button>
    </>
  );
}

function CheckSummary(props: { problems: string[]; issues: string[]; lines: number; itemsSum: number | null; total: number | null }) {
  if (props.problems.length) {
    return (
      <Notice tone="danger" title="Fix these before saving">
        <ul className="list-disc pl-4">{props.problems.map((p) => <li key={p}>{p}</li>)}</ul>
      </Notice>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <MiniStat label="Lines" value={String(props.lines)} />
        <MiniStat label="Lines add up to" value={euro(props.itemsSum)} highlight={props.issues.length > 0} />
        <MiniStat label="Receipt total" value={euro(props.total)} />
      </div>
      {props.issues.length ? (
        <Notice tone="warn" title="Some checks failed">
          <p>Compare with the photo and correct the values, or save it marked for review.</p>
          <ul className="mt-1 list-disc pl-4">{props.issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </Notice>
      ) : (
        <Notice tone="ok" title="All checks passed: the lines add up to the total." />
      )}
    </div>
  );
}

function MiniStat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-2.5 ${highlight ? "border-warn/40 bg-warn-soft" : "border-line bg-surface"}`}>
      <p className="text-[11px] text-muted">{label}</p>
      <p className="tabular font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

const small = "w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

function ItemRow({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: DraftItem;
  index: number;
  onChange: (patch: Partial<DraftItem>) => void;
  onRemove: () => void;
}) {
  const negative = item.line_type === "discount" || item.line_type === "deposit_return";
  return (
    <li className="py-3" data-testid="item-row">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 font-medium outline-none hover:border-line focus:border-brand focus:bg-surface"
            value={item.name}
            placeholder="Product name"
            aria-label={`Line ${index + 1} product`}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          {item.raw_text && item.raw_text !== item.name && <p className="truncate px-2 text-xs text-muted">{item.raw_text}</p>}
        </div>
        <input
          inputMode="decimal"
          className={`tabular w-24 rounded-md border border-line bg-surface px-2 py-1 text-right font-semibold outline-none focus:border-brand focus:ring-2 focus:ring-brand/25 ${negative ? "text-ok" : ""}`}
          value={item.total_price}
          placeholder="0,00"
          aria-label={`Line ${index + 1} total`}
          onChange={(e) => onChange({ total_price: e.target.value })}
        />
        <button type="button" className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Remove line ${index + 1}`} onClick={onRemove}>
          <TrashIcon size={18} />
        </button>
      </div>
      {/* Phones: type, qty, price. VAT joins from small tablets up, where there is room. */}
      <div className="mt-2 grid grid-cols-[1.6fr_1fr_1fr] gap-2 pl-2 sm:grid-cols-[1.3fr_1fr_1fr_0.7fr] sm:pr-9">
        <select className={small} value={item.line_type} aria-label={`Line ${index + 1} type`} onChange={(e) => onChange({ line_type: e.target.value as LineType })}>
          {LINE_TYPES.map((t) => (
            <option key={t} value={t}>
              {LINE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <input inputMode="decimal" className={small} value={item.quantity} placeholder="Qty" aria-label={`Line ${index + 1} quantity`} onChange={(e) => onChange({ quantity: e.target.value })} />
        <input inputMode="decimal" className={small} value={item.unit_price} placeholder="€/unit" aria-label={`Line ${index + 1} unit price`} onChange={(e) => onChange({ unit_price: e.target.value })} />
        <input className={`${small} hidden sm:block`} value={item.vat_code} placeholder="VAT" aria-label={`Line ${index + 1} VAT`} onChange={(e) => onChange({ vat_code: e.target.value })} />
      </div>
    </li>
  );
}

// --- Saved -----------------------------------------------------------------------------------------------

function SavedCard({ saved, onNext }: { saved: SavedReceipt; onNext: () => void }) {
  return (
    <Card className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft text-ok">
        <CheckIcon size={34} />
      </div>
      <h2 className="text-xl font-semibold">Saved to your spreadsheet</h2>
      <p className="mt-1 text-sm text-muted">
        {saved.store_name} · {germanDate(saved.date) || "no date"} · {saved.line_items.length} items
      </p>
      <p className="tabular mt-3 text-3xl font-bold tracking-tight">{euro(saved.total)}</p>
      {saved.needs_review && <p className="mt-2 text-sm text-warn">Marked for review: the numbers didn&apos;t fully add up.</p>}
      <div className="mt-6 flex w-full max-w-sm flex-col gap-3 sm:flex-row">
        <button type="button" className={`${button.primary} flex-1`} onClick={onNext}>
          <CameraIcon size={18} /> Scan next receipt
        </button>
        <Link href={`/receipts/${saved.id}`} className={`${button.secondary} flex-1`}>
          View receipt
        </Link>
      </div>
    </Card>
  );
}
