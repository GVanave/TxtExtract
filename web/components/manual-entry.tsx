"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { CATEGORIES } from "@/lib/categories";
import { parseAmount } from "@/lib/draft";
import { dayLabel, euro } from "@/lib/format";
import { MAX_MANUAL_AMOUNT } from "@/lib/manual";
import type { SavedReceipt } from "@/lib/receipt";

import { CheckIcon, PencilIcon, Spinner } from "./icons";
import { button, Card, input, Notice } from "./ui";

/** A purchase without a receipt: amount (required), what and where (optional), category. Saved with today's date. */
export function ManualEntryForm({ todayLabel }: { todayLabel: string }) {
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState("");
  const [store, setStore] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedReceipt | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const value = parseAmount(amount);
    if (value === null || value === undefined || value <= 0 || value > MAX_MANUAL_AMOUNT || Math.round(value * 100) !== value * 100) {
      setError("Bitte trage einen gültigen Betrag ein (zum Beispiel 12,49).");
      amountInput.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    const response = await fetch("/api/receipts/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: value, what, store, category: category || null }),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { saved?: SavedReceipt; error?: string } | null;
    setSaving(false);
    if (response?.ok && body?.saved) {
      setSaved(body.saved);
      return;
    }
    setError(body?.error ?? "Speichern hat nicht geklappt. Bitte versuche es noch einmal.");
  }

  function again() {
    setSaved(null);
    setAmount("");
    setWhat("");
    setStore("");
    setCategory("");
  }

  if (saved) {
    return (
      <Card className="flex flex-col items-center px-6 py-10 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ok-soft text-ok">
          <CheckIcon size={34} />
        </div>
        <h2 className="text-2xl font-semibold">Gespeichert</h2>
        <p className="mt-1 text-muted">
          {saved.line_items[0]?.name} · {dayLabel(saved.date!)}
        </p>
        <p className="tabular mt-3 text-4xl font-bold tracking-tight">{euro(saved.total)}</p>
        <div className="mt-6 flex w-full max-w-sm flex-col gap-3">
          <button type="button" className={`${button.primary} w-full`} onClick={again}>
            <PencilIcon size={22} /> Noch etwas eintragen
          </button>
          <Link href={`/receipts/${saved.id}`} className={`${button.secondary} w-full`}>
            Einkauf ansehen
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form onSubmit={save} className="space-y-4" noValidate>
      <Card className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-base font-semibold">Betrag (€)</span>
          <input
            ref={amountInput}
            className={`${input} tabular text-right text-3xl font-bold`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={error !== null}
            autoFocus
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-base font-semibold">Kategorie</span>
          <select className={input} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Keine Kategorie</option>
            {CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-base font-semibold">
            Was? <span className="font-normal text-muted">(freiwillig)</span>
          </span>
          <input className={input} maxLength={80} placeholder="z. B. Brötchen, Wochenmarkt" value={what} onChange={(e) => setWhat(e.target.value)} />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-base font-semibold">
            Wo? <span className="font-normal text-muted">(freiwillig)</span>
          </span>
          <input className={input} maxLength={80} placeholder="z. B. Bäckerei Müller" value={store} onChange={(e) => setStore(e.target.value)} />
        </label>

        <p className="rounded-xl bg-surface-2 px-4 py-3 text-base">
          <span className="font-semibold">Datum:</span> heute, {todayLabel}
        </p>
      </Card>

      {error && <Notice tone="danger" title="Nicht gespeichert">{error}</Notice>}

      <button type="submit" className={`${button.primary} w-full`} disabled={saving}>
        {saving ? <Spinner size={20} /> : <CheckIcon size={20} />} Speichern
      </button>
    </form>
  );
}
