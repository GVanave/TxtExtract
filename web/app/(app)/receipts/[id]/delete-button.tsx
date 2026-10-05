"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner, TrashIcon } from "@/components/icons";
import { button, Notice } from "@/components/ui";

export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/receipts/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) {
      router.push("/receipts");
      router.refresh();
      return;
    }
    const body = await response.json().catch(() => null);
    setError((body as { error?: string } | null)?.error ?? "Could not delete the receipt.");
    setBusy(false);
  }

  if (!confirming) {
    return (
      <button type="button" className={button.ghost} onClick={() => setConfirming(true)}>
        <TrashIcon size={16} /> Delete receipt
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border border-danger/30 bg-danger-soft p-4">
      <p className="text-sm">Delete this receipt and its lines from the spreadsheet? This can&apos;t be undone.</p>
      {error && <Notice tone="danger" title="Delete failed">{error}</Notice>}
      <div className="flex gap-2">
        <button type="button" className={button.danger} disabled={busy} onClick={remove}>
          {busy ? <Spinner size={16} /> : <TrashIcon size={16} />} Yes, delete
        </button>
        <button type="button" className={button.secondary} disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
