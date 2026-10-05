import "server-only";

import type { SavedReceipt } from "@/lib/receipt";
import { getStore, StoreError } from "@/lib/store";

import { Notice } from "./ui";

/** Load saved receipts for a server page; a storage problem becomes a readable message instead of a crash. */
export async function loadReceipts(): Promise<
  { ok: true; receipts: SavedReceipt[]; sheetUrl: string | null } | { ok: false; message: React.ReactNode }
> {
  try {
    const store = getStore();
    return { ok: true, receipts: await store.list(), sheetUrl: store.sheetUrl() };
  } catch (error) {
    const text = error instanceof StoreError ? error.message : "Could not load your receipts. Please try again.";
    if (!(error instanceof StoreError)) console.error("loading receipts failed", error);
    return { ok: false, message: <Notice tone="danger" title="Couldn't reach your spreadsheet">{text}</Notice> };
  }
}
