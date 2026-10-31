"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Spinner, TrashIcon } from "@/components/icons";
import { button, Notice } from "@/components/ui";
import { UNDO_KEY } from "@/components/deleted-undo";

/** Deletes at once (no "are you sure?"); the receipts list then offers "Rückgängig" for a few seconds. */
export function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/receipts/${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { deleted?: unknown; error?: string } | null;
    if (response.ok && body?.deleted) {
      try {
        sessionStorage.setItem(UNDO_KEY, JSON.stringify(body.deleted));
      } catch {
        // No storage (private mode): deleting still works, only undo is not offered.
      }
      router.push("/receipts?geloescht=1");
      router.refresh();
      return;
    }
    setError(body?.error ?? "Löschen hat nicht geklappt. Bitte versuche es noch einmal.");
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      {error && <Notice tone="danger" title="Nicht gelöscht">{error}</Notice>}
      <button type="button" className={button.secondary} disabled={busy} onClick={remove}>
        {busy ? <Spinner size={18} /> : <TrashIcon size={18} />} Einkauf löschen
      </button>
    </div>
  );
}
