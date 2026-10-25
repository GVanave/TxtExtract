import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { categoryById, categoryBySlug, type CategorySlug, type CategorySource } from "../categories";
import type { LineItem, Receipt, SavedLineItem, SavedReceipt } from "../receipt";
import { type Db, getDb } from "./client";
import { categoryMemory, receiptItems, receipts, storeAliases, stores, users } from "./schema";

export { StoreError } from "./client";

export type SaveMeta = { issues: string[]; model: string | null; imageName: string | null; rawExtraction?: unknown };
export type MonthTotal = { month: string; totalCents: number; trips: number };

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Conn = Db | Tx;

export const toCents = (euros: number) => Math.round(euros * 100);
const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fromCents = (cents: number | null) => (cents === null ? null : cents / 100);

/** "Lidl  Dienstleistung" -> "LIDL DIENSTLEISTUNG": how printed names and products are compared. */
export const normalizeKey = (text: string) => text.trim().replace(/\s+/g, " ").toUpperCase();

const CHAINS: [RegExp, string][] = [
  [/^LIDL\b/, "LIDL"],
  [/^ALDI\s*(SÜD|SUED|SUD)\b/, "ALDI SÜD"],
  [/^ALDI\s*NORD\b/, "ALDI NORD"],
  [/^ALDI\b/, "ALDI"],
  [/^REWE\b/, "REWE"],
  [/^EDEKA\b/, "EDEKA"],
  [/^NETTO\b/, "NETTO"],
  [/^PENNY\b/, "PENNY"],
  [/^KAUFLAND\b/, "KAUFLAND"],
  [/^NORMA\b/, "NORMA"],
  [/^GLOBUS\b/, "GLOBUS"],
  [/^TEGUT\b/, "TEGUT"],
  [/^DM\b|^DM-DROGERIE/, "dm"],
  [/^ROSSMANN\b/, "ROSSMANN"],
  [/^M(Ü|UE)LLER\b/, "MÜLLER"],
];

/** The display name for a printed store name: known chains are unified, anything else is kept as printed. */
export function canonicalStoreName(printed: string): string {
  const key = normalizeKey(printed);
  return CHAINS.find(([pattern]) => pattern.test(key))?.[1] ?? printed.trim().replace(/\s+/g, " ");
}

export class ReceiptStore {
  /** `connect` defaults to the app database; tests pass their own PGlite database. */
  constructor(private readonly connect: () => Promise<Db> = getDb) {}

  private db() {
    return this.connect();
  }

  /** The user's id, creating the user on first sign-in. */
  async userId(email: string): Promise<string> {
    const db = await this.db();
    const [row] = await db
      .insert(users)
      .values({ email: email.toLowerCase() })
      .onConflictDoUpdate({ target: users.email, set: { email: sql`excluded.email` } })
      .returning({ id: users.id });
    return row.id;
  }

  // --- stores -----------------------------------------------------------------------------------------

  private async findStoreId(conn: Conn, userId: string, printed: string): Promise<string | null> {
    const [alias] = await conn
      .select({ storeId: storeAliases.storeId })
      .from(storeAliases)
      .where(and(eq(storeAliases.userId, userId), eq(storeAliases.alias, normalizeKey(printed))));
    if (alias) return alias.storeId;
    const [store] = await conn
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.userId, userId), sql`lower(${stores.name}) = lower(${canonicalStoreName(printed)})`));
    return store?.id ?? null;
  }

  private async resolveStoreId(conn: Conn, userId: string, printed: string): Promise<string> {
    const alias = normalizeKey(printed);
    let storeId = await this.findStoreId(conn, userId, printed);
    if (!storeId) {
      // ON CONFLICT DO NOTHING + re-read: safe if the same store is created at the same moment elsewhere.
      await conn.insert(stores).values({ userId, name: canonicalStoreName(printed) }).onConflictDoNothing();
      storeId = await this.findStoreId(conn, userId, printed);
      if (!storeId) throw new Error(`Could not create store '${printed}'.`);
    }
    await conn.insert(storeAliases).values({ userId, alias, storeId }).onConflictDoNothing();
    return storeId;
  }

  // --- categories -------------------------------------------------------------------------------------

  /** Remembered category for a printed product: same store first, then any store (most recent). */
  private async rememberedCategories(conn: Conn, userId: string, storeId: string | null, keys: string[]) {
    const result = new Map<string, number>();
    if (!keys.length) return result;
    const rows = await conn
      .select({ storeId: categoryMemory.storeId, key: categoryMemory.productKey, categoryId: categoryMemory.categoryId })
      .from(categoryMemory)
      .where(and(eq(categoryMemory.userId, userId), inArray(categoryMemory.productKey, keys)))
      .orderBy(desc(categoryMemory.updatedAt));
    for (const row of rows) if (row.storeId === storeId) result.set(row.key, row.categoryId);
    for (const row of rows) if (!result.has(row.key)) result.set(row.key, row.categoryId);
    return result;
  }

  /** Before review: replace Gemini's guesses with your earlier corrections, where you made one. */
  async applyMemory(userId: string, receipt: Receipt): Promise<Receipt> {
    const db = await this.db();
    const storeId = await this.findStoreId(db, userId, receipt.store_name);
    const products = receipt.line_items.filter((i) => i.line_type === "product");
    const memory = await this.rememberedCategories(db, userId, storeId, [...new Set(products.map((i) => productKey(i)))]);
    return {
      ...receipt,
      line_items: receipt.line_items.map((item) => {
        const remembered = item.line_type === "product" ? categoryById(memory.get(productKey(item))) : null;
        return remembered ? { ...item, category: remembered.slug, category_source: "memory" as const } : item;
      }),
    };
  }

  private async remember(conn: Conn, userId: string, storeId: string, key: string, categoryId: number) {
    await conn
      .insert(categoryMemory)
      .values({ userId, storeId, productKey: key, categoryId })
      .onConflictDoUpdate({
        target: [categoryMemory.userId, categoryMemory.storeId, categoryMemory.productKey],
        set: { categoryId, updatedAt: sql`now()` },
      });
  }

  /** Change one line's category (from the receipt page). Discounts right below a product follow it. */
  async setItemCategory(userId: string, itemId: string, slug: CategorySlug | null): Promise<boolean> {
    if (!isUuid(itemId)) return false;
    const db = await this.db();
    const category = slug ? categoryBySlug(slug) : null;
    return db.transaction(async (tx) => {
      const [item] = await tx
        .select({ receiptId: receiptItems.receiptId, position: receiptItems.position, lineType: receiptItems.lineType, rawText: receiptItems.rawText, name: receiptItems.name, storeId: receipts.storeId })
        .from(receiptItems)
        .innerJoin(receipts, eq(receipts.id, receiptItems.receiptId))
        .where(and(eq(receiptItems.id, itemId), eq(receipts.userId, userId)));
      if (!item || item.lineType !== "product") return false;

      const lines = await tx
        .select({ id: receiptItems.id, lineType: receiptItems.lineType })
        .from(receiptItems)
        .where(eq(receiptItems.receiptId, item.receiptId))
        .orderBy(asc(receiptItems.position));
      const index = lines.findIndex((l) => l.id === itemId);
      const ids = [itemId];
      for (const line of lines.slice(index + 1)) {
        if (line.lineType !== "discount") break;
        ids.push(line.id);
      }
      await tx
        .update(receiptItems)
        .set({ categoryId: category?.id ?? null, categorySource: category ? "user" : null })
        .where(inArray(receiptItems.id, ids));
      if (category) await this.remember(tx, userId, item.storeId, productKey({ raw_text: item.rawText, name: item.name }), category.id);
      return true;
    });
  }

  // --- receipts ---------------------------------------------------------------------------------------

  async save(userId: string, receipt: Receipt, meta: SaveMeta): Promise<SavedReceipt> {
    if (!receipt.date) throw new Error("A receipt needs a date.");
    const db = await this.db();
    const id = await db.transaction(async (tx) => {
      const storeId = await this.resolveStoreId(tx, userId, receipt.store_name);
      const [row] = await tx
        .insert(receipts)
        .values({
          userId,
          storeId,
          storeRaw: receipt.store_name.trim(),
          storeAddress: receipt.store_address,
          purchasedOn: receipt.date!,
          purchasedAt: receipt.time,
          totalCents: toCents(receipt.total),
          currency: receipt.currency || "EUR",
          paymentMethod: receipt.payment_method,
          needsReview: meta.issues.length > 0,
          issues: meta.issues,
          model: meta.model,
          imageName: meta.imageName,
          rawExtraction: meta.rawExtraction ?? null,
        })
        .returning({ id: receipts.id });

      let last: { categoryId: number | null; source: CategorySource | null } = { categoryId: null, source: null };
      const values = [];
      for (const [index, item] of receipt.line_items.entries()) {
        let categoryId: number | null = null;
        let source: CategorySource | null = null;
        if (item.line_type === "product") {
          categoryId = categoryBySlug(item.category)?.id ?? null;
          source = categoryId ? (item.category_source ?? "model") : null;
          if (categoryId && source === "user") await this.remember(tx, userId, storeId, productKey(item), categoryId);
          last = { categoryId, source };
        } else if (item.line_type === "discount") {
          ({ categoryId, source } = last); // a discount counts against the product above it
        }
        values.push({
          receiptId: row.id,
          position: index + 1,
          rawText: item.raw_text,
          name: item.name,
          lineType: item.line_type,
          quantity: item.quantity,
          unit: item.unit,
          unitPriceCents: item.unit_price === null ? null : toCents(item.unit_price),
          totalCents: toCents(item.total_price),
          vatCode: item.vat_code,
          categoryId,
          categorySource: source,
        });
      }
      if (values.length) await tx.insert(receiptItems).values(values);
      return row.id;
    });
    return (await this.get(userId, id))!;
  }

  /** Receipts, newest first. `month` ("2026-09") limits to one month; `months` to several. */
  async list(userId: string, filter: { month?: string; months?: string[] } = {}): Promise<SavedReceipt[]> {
    const db = await this.db();
    const months = filter.month ? [filter.month] : filter.months;
    if (months && !months.length) return [];
    const conditions = [eq(receipts.userId, userId)];
    if (months) conditions.push(inArray(sql`to_char(${receipts.purchasedOn}, 'YYYY-MM')`, months));
    const rows = await db
      .select({ receipt: receipts, storeName: stores.name })
      .from(receipts)
      .innerJoin(stores, eq(stores.id, receipts.storeId))
      .where(and(...conditions))
      .orderBy(desc(receipts.purchasedOn), sql`${receipts.purchasedAt} DESC NULLS LAST`, desc(receipts.createdAt));
    return this.withItems(db, rows);
  }

  async get(userId: string, id: string): Promise<SavedReceipt | null> {
    if (!isUuid(id)) return null;
    const db = await this.db();
    const rows = await db
      .select({ receipt: receipts, storeName: stores.name })
      .from(receipts)
      .innerJoin(stores, eq(stores.id, receipts.storeId))
      .where(and(eq(receipts.userId, userId), eq(receipts.id, id)));
    return (await this.withItems(db, rows))[0] ?? null;
  }

  private async withItems(
    db: Db,
    rows: { receipt: typeof receipts.$inferSelect; storeName: string }[],
  ): Promise<SavedReceipt[]> {
    const ids = rows.map((r) => r.receipt.id);
    const items = ids.length
      ? await db.select().from(receiptItems).where(inArray(receiptItems.receiptId, ids)).orderBy(asc(receiptItems.receiptId), asc(receiptItems.position))
      : [];
    const byReceipt = new Map<string, SavedLineItem[]>();
    for (const i of items) {
      const list = byReceipt.get(i.receiptId) ?? [];
      list.push({
        id: i.id,
        raw_text: i.rawText,
        name: i.name,
        line_type: i.lineType as LineItem["line_type"],
        quantity: i.quantity === null ? null : Number(i.quantity),
        unit: i.unit,
        unit_price: fromCents(i.unitPriceCents),
        total_price: i.totalCents / 100,
        vat_code: i.vatCode,
        category: categoryById(i.categoryId)?.slug ?? null,
        category_source: (i.categorySource as CategorySource | null) ?? null,
      });
      byReceipt.set(i.receiptId, list);
    }
    return rows.map(({ receipt: r, storeName }) => ({
      id: r.id,
      store_id: r.storeId,
      store_name: storeName,
      store_raw: r.storeRaw,
      store_address: r.storeAddress,
      date: r.purchasedOn,
      time: r.purchasedAt ? r.purchasedAt.slice(0, 5) : null,
      currency: r.currency,
      total: r.totalCents / 100,
      payment_method: r.paymentMethod,
      vat_summary: [],
      needs_review: r.needsReview,
      issues: r.issues,
      model: r.model,
      image_name: r.imageName,
      saved_at: r.createdAt.toISOString(),
      line_items: byReceipt.get(r.id) ?? [],
    }));
  }

  async delete(userId: string, id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const db = await this.db();
    const deleted = await db.delete(receipts).where(and(eq(receipts.userId, userId), eq(receipts.id, id))).returning({ id: receipts.id });
    return deleted.length > 0;
  }

  /** A saved receipt from the same store, day, time and total, if any. */
  async findDuplicate(userId: string, receipt: Receipt): Promise<SavedReceipt | null> {
    if (!receipt.date) return null;
    const db = await this.db();
    const storeId = await this.findStoreId(db, userId, receipt.store_name);
    if (!storeId) return null;
    const [row] = await db
      .select({ id: receipts.id })
      .from(receipts)
      .where(
        and(
          eq(receipts.userId, userId),
          eq(receipts.storeId, storeId),
          eq(receipts.purchasedOn, receipt.date),
          receipt.time ? eq(receipts.purchasedAt, receipt.time) : sql`${receipts.purchasedAt} IS NULL`,
          eq(receipts.totalCents, toCents(receipt.total)),
        ),
      )
      .limit(1);
    return row ? this.get(userId, row.id) : null;
  }

  /** Total and number of receipts per month, oldest first. */
  async monthTotals(userId: string): Promise<MonthTotal[]> {
    const db = await this.db();
    const month = sql<string>`to_char(${receipts.purchasedOn}, 'YYYY-MM')`;
    const rows = await db
      .select({ month, totalCents: sql<number>`sum(${receipts.totalCents})::int`, trips: sql<number>`count(*)::int` })
      .from(receipts)
      .where(eq(receipts.userId, userId))
      .groupBy(month)
      .orderBy(month);
    return rows.map((r) => ({ month: r.month, totalCents: Number(r.totalCents), trips: Number(r.trips) }));
  }
}

/** How a product is recognised again: its printed text (stable per chain), or its name for hand-added lines. */
export function productKey(item: Pick<LineItem, "raw_text" | "name">): string {
  return normalizeKey(item.raw_text || item.name);
}

let defaultStore: ReceiptStore | null = null;
export function getStore(): ReceiptStore {
  defaultStore ??= new ReceiptStore();
  return defaultStore;
}
