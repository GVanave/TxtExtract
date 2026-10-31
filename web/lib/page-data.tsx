import "server-only";

import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";

import { Notice } from "@/components/ui";

import { currentUser } from "./auth";
import { getStore, type ReceiptStore, StoreError } from "./db/store";
import { logError } from "./log";

/** Runs a server page's database reads; a database problem becomes a readable message instead of a crash. */
export async function loadPageData<T>(
  read: (session: { userId: string; store: ReceiptStore }) => Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; message: ReactNode }> {
  try {
    const email = await currentUser();
    if (!email) throw new StoreError("Bitte melde dich erneut an.");
    const store = getStore();
    return { ok: true, data: await read({ userId: await store.userId(email), store }) };
  } catch (error) {
    unstable_rethrow(error); // let Next.js handle its own signals (dynamic rendering, redirects, not found)
    logError("loading page data failed", error);
    const text = error instanceof StoreError ? error.message : "Bitte lade die Seite in einem Moment neu.";
    return { ok: false, message: <Notice tone="danger" title="Deine Einkäufe konnten nicht geladen werden">{text}</Notice> };
  }
}
