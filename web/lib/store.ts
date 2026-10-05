import "server-only";

import { JWT } from "google-auth-library";

import type { Receipt, SavedReceipt } from "./receipt";
import {
  ITEM_HEADERS,
  ITEMS_TAB,
  itemsToRows,
  newReceiptId,
  RECEIPT_HEADERS,
  RECEIPTS_TAB,
  receiptToRow,
  rowsToReceipts,
  sortNewestFirst,
  type Row,
} from "./sheet-rows";

export class StoreError extends Error {}

export type SaveMeta = { issues: string[]; model: string | null; imageName: string | null };

export interface ReceiptStore {
  list(): Promise<SavedReceipt[]>;
  save(receipt: Receipt, meta: SaveMeta): Promise<SavedReceipt>;
  delete(id: string): Promise<boolean>;
  /** Link to open the data in a spreadsheet, if there is one. */
  sheetUrl(): string | null;
}

export function toSaved(receipt: Receipt, meta: SaveMeta, now = new Date()): SavedReceipt {
  return {
    ...receipt,
    id: newReceiptId(now),
    saved_at: now.toISOString().slice(0, 19).replace("T", " "),
    needs_review: meta.issues.length > 0,
    issues: meta.issues,
    model: meta.model,
    image_name: meta.imageName,
  };
}

export function findDuplicate(existing: SavedReceipt[], receipt: Receipt): SavedReceipt | null {
  return (
    existing.find(
      (r) =>
        r.store_name.trim().toLowerCase() === receipt.store_name.trim().toLowerCase() &&
        r.date === receipt.date &&
        r.time === receipt.time &&
        Math.round(r.total * 100) === Math.round(receipt.total * 100),
    ) ?? null
  );
}

// --- Google Sheets ---------------------------------------------------------------------------------------

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsStore implements ReceiptStore {
  private readonly client: JWT;
  private tabsReady: Promise<Map<string, number>> | null = null;

  constructor(
    private readonly spreadsheetId: string,
    serviceAccountEmail: string,
    privateKey: string,
  ) {
    this.client = new JWT({
      email: serviceAccountEmail,
      // Vercel/.env store the key on one line with literal "\n".
      key: privateKey.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  }

  sheetUrl() {
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/edit`;
  }

  private async request<T>(path: string, method = "GET", data?: unknown): Promise<T> {
    try {
      const response = await this.client.request<T>({ url: `${API}/${this.spreadsheetId}${path}`, method, data });
      return response.data;
    } catch (error) {
      const status = (error as { status?: number; response?: { status?: number } }).response?.status;
      if (status === 403 || status === 404) {
        throw new StoreError(
          `Google Sheets refused access (${status}). Share the spreadsheet with ${this.client.email} as Editor ` +
            "and check GOOGLE_SHEET_ID.",
        );
      }
      throw new StoreError(`Google Sheets request failed: ${(error as Error).message}`);
    }
  }

  /** Create the Receipts and Items tabs with header rows if they don't exist yet. Returns tab name -> sheetId. */
  private ensureTabs(): Promise<Map<string, number>> {
    this.tabsReady ??= (async () => {
      type Meta = { sheets: { properties: { title: string; sheetId: number } }[] };
      const meta = await this.request<Meta>("?fields=sheets.properties(title,sheetId)");
      const tabs = new Map(meta.sheets.map((s) => [s.properties.title, s.properties.sheetId]));
      const missing = [RECEIPTS_TAB, ITEMS_TAB].filter((title) => !tabs.has(title));
      if (missing.length) {
        type Reply = { replies: { addSheet: { properties: { title: string; sheetId: number } } }[] };
        const reply = await this.request<Reply>(":batchUpdate", "POST", {
          requests: missing.map((title) => ({
            addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } },
          })),
        });
        for (const r of reply.replies) tabs.set(r.addSheet.properties.title, r.addSheet.properties.sheetId);
        await this.request("/values:batchUpdate", "POST", {
          valueInputOption: "RAW",
          data: missing.map((title) => ({
            range: `${title}!A1`,
            values: [title === RECEIPTS_TAB ? [...RECEIPT_HEADERS] : [...ITEM_HEADERS]],
          })),
        });
      }
      return tabs;
    })().catch((error) => {
      this.tabsReady = null; // retry on the next request
      throw error;
    });
    return this.tabsReady;
  }

  private async readAll(): Promise<{ receipts: unknown[][]; items: unknown[][] }> {
    await this.ensureTabs();
    const ranges = [`${RECEIPTS_TAB}!A2:N`, `${ITEMS_TAB}!A2:L`].map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    type Batch = { valueRanges: { values?: unknown[][] }[] };
    const batch = await this.request<Batch>(`/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);
    return { receipts: batch.valueRanges[0]?.values ?? [], items: batch.valueRanges[1]?.values ?? [] };
  }

  async list() {
    const { receipts, items } = await this.readAll();
    return rowsToReceipts(receipts, items);
  }

  private append(tab: string, rows: Row[]) {
    if (!rows.length) return Promise.resolve();
    // RAW: values are stored as typed, so text like "=..." from a receipt can never become a formula.
    return this.request(`/values/${encodeURIComponent(`${tab}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, "POST", {
      values: rows,
    });
  }

  async save(receipt: Receipt, meta: SaveMeta) {
    await this.ensureTabs();
    const saved = toSaved(receipt, meta);
    // Items first: the receipt row is what makes a receipt appear, so a failure in between leaves no half receipt.
    await this.append(ITEMS_TAB, itemsToRows(saved));
    await this.append(RECEIPTS_TAB, [receiptToRow(saved)]);
    return saved;
  }

  async delete(id: string) {
    const tabs = await this.ensureTabs();
    const { receipts, items } = await this.readAll();
    // Row index in the sheet = position in the A2:… range + 1 (header row is index 0).
    const rowsWithId = (rows: unknown[][]) =>
      rows.flatMap((row, index) => (String(row[0] ?? "").trim() === id ? [index + 1] : []));
    const receiptRows = rowsWithId(receipts);
    if (!receiptRows.length) return false;

    const deletions = [
      ...receiptRows.map((row) => ({ sheetId: tabs.get(RECEIPTS_TAB)!, row })),
      ...rowsWithId(items).map((row) => ({ sheetId: tabs.get(ITEMS_TAB)!, row })),
    ].sort((a, b) => b.row - a.row); // bottom-up so earlier deletions don't shift later ones

    await this.request(":batchUpdate", "POST", {
      requests: deletions.map(({ sheetId, row }) => ({
        deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row, endIndex: row + 1 } },
      })),
    });
    return true;
  }
}

// --- In-memory store: local development and tests only ---------------------------------------------------

export class MemoryStore implements ReceiptStore {
  private receipts: SavedReceipt[] = [];

  sheetUrl() {
    return null;
  }

  async list() {
    return sortNewestFirst(this.receipts);
  }

  async save(receipt: Receipt, meta: SaveMeta) {
    const saved = toSaved(receipt, meta);
    this.receipts.push(saved);
    return saved;
  }

  async delete(id: string) {
    const before = this.receipts.length;
    this.receipts = this.receipts.filter((r) => r.id !== id);
    return this.receipts.length < before;
  }
}

// --- Selection -------------------------------------------------------------------------------------------

const globalStore = globalThis as unknown as { __receiptStore?: ReceiptStore };

export function getStore(): ReceiptStore {
  if (globalStore.__receiptStore) return globalStore.__receiptStore;

  const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = process.env;
  let store: ReceiptStore;
  if (GOOGLE_SHEET_ID && GOOGLE_SERVICE_ACCOUNT_EMAIL && GOOGLE_PRIVATE_KEY) {
    store = new SheetsStore(GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
  } else if (process.env.NODE_ENV !== "production" && process.env.DATA_BACKEND === "memory") {
    store = new MemoryStore();
  } else {
    throw new StoreError(
      "Google Sheets is not configured. Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY.",
    );
  }
  globalStore.__receiptStore = store;
  return store;
}
