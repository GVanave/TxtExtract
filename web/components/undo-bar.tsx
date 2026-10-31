"use client";

import { useEffect, useRef } from "react";

/**
 * A message with a "Rückgängig" (undo) button above the tab bar, instead of asking "Are you sure?" first.
 * Disappears by itself after `seconds`.
 */
export function UndoBar({
  message,
  onUndo,
  onClose,
  seconds = 8,
  actionLabel = "Rückgängig",
}: {
  message: string;
  onUndo: () => void;
  onClose: () => void;
  seconds?: number;
  actionLabel?: string;
}) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => close.current(), seconds * 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-bg shadow-lg sm:bottom-6"
    >
      <span className="flex-1 text-base">{message}</span>
      <button type="button" onClick={onUndo} className="min-h-11 rounded-lg px-3 text-base font-bold text-brand-soft underline underline-offset-4">
        {actionLabel}
      </button>
    </div>
  );
}
