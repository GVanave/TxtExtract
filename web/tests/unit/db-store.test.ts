import { sql } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createPgliteDb, type Db } from "@/lib/db/client";
import { canonicalStoreName, ReceiptStore } from "@/lib/db/store";
import type { Receipt } from "@/lib/receipt";

import { item, receipt } from "./fixtures";

let db: Db;
let store: ReceiptStore;
let me: string;

beforeAll(async () => {
  db = await createPgliteDb(); // a real, migrated Postgres running inside the test process
  store = new ReceiptStore(async () => db);
}, 60_000);

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, stores, store_aliases, receipts, receipt_items, category_memory CASCADE`);
  me = await store.userId("me@example.com");
});

const meta = { issues: [], model: "m", imageName: "bon.jpg" };

const LIDL: Receipt = receipt(
  [
    item("BIO VOLLM. 3,8%", 1.19, { category: "dairy" }),
    item("BANANEN", 1.44, { quantity: 0.482, unit: "kg", unit_price: 2.99, category: "produce" }),
    item("PFAND 0,25", 0.25, { line_type: "deposit", vat_code: "A" }),
    item("JOGHURT NAT.", 1.58, { quantity: 2, unit: "pcs", unit_price: 0.79, category: "dairy" }),
    item("RABATT JOGHURT", -0.3, { line_type: "discount" }),
    item("ZEWA KUECHENR.", 2.99, { category: "other" }),
  ],
  { store_name: "Lidl Dienstleistung GmbH & Co. KG", date: "2026-10-24", time: "18:42" },
);

describe("ReceiptStore", () => {
  it("saves a receipt and reads it back exactly, with ids", async () => {
    const saved = await store.save(me, LIDL, meta);
    expect(saved).toMatchObject({ store_name: "LIDL", store_raw: "Lidl Dienstleistung GmbH & Co. KG", date: "2026-10-24", time: "18:42", total: 7.15, needs_review: false, image_name: "bon.jpg" });
    expect(saved.line_items.map(({ id, ...rest }) => (expect(id).toMatch(/^[0-9a-f-]{36}$/), rest))).toEqual(
      LIDL.line_items.map((i) => ({ ...i, category_source: i.category ? "model" : i.line_type === "discount" ? "model" : null })).map((i, n) =>
        n === 4 ? { ...i, category: "dairy" } : i,
      ),
    );
    expect(await store.get(me, saved.id)).toEqual(saved);
  });

  it("gives a discount the category of the product above it", async () => {
    const saved = await store.save(me, LIDL, meta);
    expect(saved.line_items[4]).toMatchObject({ line_type: "discount", category: "dairy" });
    expect(saved.line_items[2]).toMatchObject({ line_type: "deposit", category: null }); // Pfand has no category
  });

  it("unifies store names and keeps the printed names as aliases", async () => {
    const a = await store.save(me, LIDL, meta);
    const b = await store.save(me, { ...LIDL, store_name: "LIDL", time: "10:00" }, meta);
    const c = await store.save(me, { ...LIDL, store_name: "Aldi Süd", time: "11:00" }, meta);
    expect(b.store_id).toBe(a.store_id);
    expect(c.store_name).toBe("ALDI SÜD");
    expect(c.store_id).not.toBe(a.store_id);
    expect(canonicalStoreName("dm-drogerie markt")).toBe("dm");
    expect(canonicalStoreName("Bäckerei  Schmidt")).toBe("Bäckerei Schmidt");
  });

  it("remembers a category correction, first for the same store, then for any store", async () => {
    const first = await store.save(me, LIDL, meta);
    const roll = first.line_items[5];
    expect(await store.setItemCategory(me, roll.id, "household")).toBe(true);
    expect((await store.get(me, first.id))!.line_items[5]).toMatchObject({ category: "household", category_source: "user" });

    const atLidl = await store.applyMemory(me, LIDL);
    expect(atLidl.line_items[5]).toMatchObject({ category: "household", category_source: "memory" });
    const atAldi = await store.applyMemory(me, { ...LIDL, store_name: "ALDI SÜD" });
    expect(atAldi.line_items[5]).toMatchObject({ category: "household", category_source: "memory" });
    expect(atAldi.line_items[0]).toMatchObject({ category: "dairy", category_source: null }); // untouched

    // A store-specific correction wins over one from another store.
    const aldi = await store.save(me, { ...atAldi, time: "09:00" }, meta);
    await store.setItemCategory(me, aldi.line_items[5].id, "other");
    expect((await store.applyMemory(me, { ...LIDL, store_name: "ALDI SÜD" })).line_items[5].category).toBe("other");
    expect((await store.applyMemory(me, LIDL)).line_items[5].category).toBe("household");
  });

  it("remembers categories chosen during review", async () => {
    const reviewed = { ...LIDL, line_items: LIDL.line_items.map((i, n) => (n === 0 ? { ...i, category: "drinks" as const, category_source: "user" as const } : i)) };
    await store.save(me, reviewed, meta);
    expect((await store.applyMemory(me, LIDL)).line_items[0]).toMatchObject({ category: "drinks", category_source: "memory" });
  });

  it("moves the discount along when a product's category changes", async () => {
    const saved = await store.save(me, LIDL, meta);
    await store.setItemCategory(me, saved.line_items[3].id, "snacks");
    const after = (await store.get(me, saved.id))!;
    expect(after.line_items[3].category).toBe("snacks");
    expect(after.line_items[4].category).toBe("snacks"); // the yogurt discount
    expect(after.line_items[0].category).toBe("dairy");
    expect(await store.setItemCategory(me, saved.line_items[2].id, "drinks")).toBe(false); // Pfand can't be categorised
  });

  it("finds duplicates by store, day, time and total", async () => {
    await store.save(me, LIDL, meta);
    expect(await store.findDuplicate(me, { ...LIDL, store_name: "LIDL" })).not.toBeNull();
    expect(await store.findDuplicate(me, { ...LIDL, time: "10:00" })).toBeNull();
    expect(await store.findDuplicate(me, { ...LIDL, store_name: "REWE" })).toBeNull();
  });

  it("lists newest first, filters by month, totals per month and deletes with lines", async () => {
    await store.save(me, { ...LIDL, date: "2026-09-02" }, meta);
    const oct = await store.save(me, LIDL, meta);
    await store.save(me, { ...LIDL, date: "2026-10-01", time: null }, meta);
    expect((await store.list(me)).map((r) => r.date)).toEqual(["2026-10-24", "2026-10-01", "2026-09-02"]);
    expect((await store.list(me, { month: "2026-09" })).map((r) => r.date)).toEqual(["2026-09-02"]);
    expect(await store.monthTotals(me)).toEqual([
      { month: "2026-09", totalCents: 715, trips: 1 },
      { month: "2026-10", totalCents: 1430, trips: 2 },
    ]);
    expect(await store.delete(me, oct.id)).toBe(true);
    expect(await store.get(me, oct.id)).toBeNull();
    expect(await store.delete(me, oct.id)).toBe(false);
  });

  it("keeps users apart", async () => {
    const saved = await store.save(me, LIDL, meta);
    const other = await store.userId("partner@example.com");
    expect(await store.list(other)).toEqual([]);
    expect(await store.get(other, saved.id)).toBeNull();
    expect(await store.delete(other, saved.id)).toBe(false);
    expect(await store.setItemCategory(other, saved.line_items[0].id, "snacks")).toBe(false);
    expect(await store.userId("ME@example.com")).toBe(me);
  });

  it("rolls back a receipt completely when saving a line fails", async () => {
    const broken = { ...LIDL, line_items: [...LIDL.line_items, item("BAD", 1, { line_type: "nonsense" as never })] };
    await expect(store.save(me, broken, meta)).rejects.toThrow();
    expect(await store.list(me)).toEqual([]);
  });

  it("requires a date", async () => {
    await expect(store.save(me, { ...LIDL, date: null }, meta)).rejects.toThrow("date");
  });
});
