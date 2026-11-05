"use client";

import { useLinkStatus } from "next/link";

/**
 * Put inside a <Link className="relative …">: while the tapped link's page is loading, the link gets a soft pulsing
 * highlight. Always rendered and only faded in, so nothing on the page moves.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 rounded-lg bg-brand/15 transition-opacity duration-200 ${pending ? "animate-pulse opacity-100" : "opacity-0"}`}
    />
  );
}
