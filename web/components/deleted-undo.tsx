"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { UndoBar } from "./undo-bar";

/** Where the just-deleted receipt waits (in this browser tab only) while "Rückgängig" is offered. */
export const UNDO_KEY = "kassenbon:geloescht";

/** Shown on the receipts list after a delete: "Einkauf gelöscht. Rückgängig". */
export function DeletedUndo() {
  const router = useRouter();
  const params = useSearchParams();
  const [deleted, setDeleted] = useState<{ receipt: { id: string } } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (params.get("geloescht") !== "1") return;
    try {
      const stored = sessionStorage.getItem(UNDO_KEY);
      // Reading browser storage after the first render is the point of this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setDeleted(JSON.parse(stored));
    } catch {
      // No storage: nothing to undo.
    }
  }, [params]);

  function finish() {
    try {
      sessionStorage.removeItem(UNDO_KEY);
    } catch {}
    setDeleted(null);
    router.replace("/receipts", { scroll: false });
  }

  if (failed) {
    return <UndoBar message="Wiederherstellen hat nicht geklappt." actionLabel="OK" onUndo={() => setFailed(false)} onClose={() => setFailed(false)} seconds={6} />;
  }
  if (!deleted) return null;

  return (
    <UndoBar
      message="Einkauf gelöscht."
      onClose={finish}
      onUndo={async () => {
        const response = await fetch("/api/receipts/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deleted),
        });
        const id = deleted.receipt.id;
        finish();
        if (response.ok) router.push(`/receipts/${id}`);
        else setFailed(true);
      }}
    />
  );
}
