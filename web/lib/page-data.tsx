import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";

import { Notice } from "@/components/ui";

import { currentUser } from "./auth";
import { getStore, type ReceiptStore, StoreError } from "./db/store";

/** Runs a server page's database reads; a database problem becomes a readable message instead of a crash. */
export async function loadPageData<T>(
  read: (session: { userId: string; store: ReceiptStore }) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; message: ReactNode }> {
  try {
    const email = await currentUser();
    if (!email) throw new StoreError("Please sign in again.");
    const store = getStore();
    return { ok: true, data: await read({ userId: await store.userId(email), store }) };
  } catch (error) {
    unstable_rethrow(error); // let Next.js handle its own signals (dynamic rendering, redirects, not found)
    const text = error instanceof StoreError ? error.message : "Could not load your receipts. Please try again.";
    if (!(error instanceof StoreError)) console.error("loading page data failed", error);
    return { ok: false, message: <Notice tone="danger" title="Couldn't reach the database">{text}</Notice> };
  }
}
