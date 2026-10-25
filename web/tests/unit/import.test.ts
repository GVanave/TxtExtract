import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPgliteDb, type Db } from "@/lib/db/client";
import { ReceiptStore } from "@/lib/db/store";
import { importFromSheet } from "@/lib/legacy/import";

import { item, LIDL_ITEMS, legacySaved, receipt } from "./fixtures";

let db: Db;
let store: ReceiptStore;
let me: string;

beforeAll(async () => {
  db = await createPgliteDb();
  store = new ReceiptStore(async () => db);
}, 60_000);

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, stores, store_aliases, receipts, receipt_items, category_memory CASCADE`);
  me = await store.userId("me@example.com");
});

const sheet = [
  legacySaved(receipt([item("KAFFEE", 5.99)], { store_name: "REWE", date: "2026-10-02" }), { id: "B" }), // newest first, like the sheet
  legacySaved(receipt(LIDL_ITEMS, { date: null }), { id: "A", saved_at: "2026-09-20 18:00:00", needs_review: true }),
  legacySaved(receipt([item("X", 1)], { store_name: " " }), { id: "C" }),
];

describe("importFromSheet", () => {
  it("imports, categorises missing products and reports totals; a second run imports nothing", async () => {
    const asked: string[][] = [];
    const categorize = async (names: string[]) => (asked.push(names), names.map((n) => (n === "KAFFEE" ? ("drinks" as const) : null)));

    const first = await importFromSheet({ receipts: sheet, store, userId: me, categorize });
    expect(first).toMatchObject({ read: 3, imported: 2, duplicates: 0, categorized: 1 });
    expect(first.invalid).toEqual(["C (  2026-10-02 1.00 €): no store or date"]);
    expect(first.importedTotalCents).toBe(first.sheetTotalCents - 100);

    const saved = await store.list(me);
    expect(saved.map((r) => [r.store_name, r.date])).toEqual([
      ["REWE", "2026-10-02"],
      ["LIDL", "2026-09-20"], // no printed date: the day it was saved
    ]);
    expect(saved[0].line_items[0]).toMatchObject({ category: "drinks", category_source: "model" });
    expect(asked[0]).toEqual(["BIO VOLLM. 3,8%", "BANANEN"]); // only products, oldest receipt first

    const again = await importFromSheet({ receipts: sheet, store, userId: me, categorize });
    expect(again).toMatchObject({ imported: 0, duplicates: 2 });
    expect(await store.list(me)).toHaveLength(2);
  });

  it("writes nothing in a dry run", async () => {
    const report = await importFromSheet({ receipts: sheet, store, userId: me, dryRun: true });
    expect(report.imported).toBe(2);
    expect(await store.list(me)).toEqual([]);
  });
});
