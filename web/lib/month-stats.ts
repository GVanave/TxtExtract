import { categoryName, CATEGORIES, UNCATEGORIZED } from "./categories";
import { monthOf, shiftMonth } from "./dates";
import type { SavedReceipt } from "./receipt";

/** Numbers for the Spending page, computed from saved receipts. All amounts in cents so sums are exact. */

const cents = (euros: number) => Math.round(euros * 100);

export type MonthBar = { month: string; totalCents: number; trips: number; current: boolean };

/** The last `count` months that have receipts, plus the average of the full (finished) months among them. */
export function chartMonths(totals: { month: string; totalCents: number; trips: number }[], today: string, count = 5) {
  const currentMonth = monthOf(today);
  const bars: MonthBar[] = totals.slice(-count).map((t) => ({ ...t, current: t.month === currentMonth }));
  const full = bars.filter((b) => !b.current);
  const averageCents = full.length ? Math.round(full.reduce((s, b) => s + b.totalCents, 0) / full.length) : null;
  return { bars, averageCents, averageOf: full.length };
}

export type MonthSummary = {
  month: string;
  totalCents: number;
  trips: number;
  perTripCents: number;
  previousMonth: string;
  previousCents: number | null;
  /** For the month that is still running: what the previous month had spent by the same day. */
  partial: { throughDay: number; previousSamePeriodCents: number } | null;
};

export function monthSummary(month: string, receipts: SavedReceipt[], previous: SavedReceipt[], today: string): MonthSummary {
  const totalCents = receipts.reduce((s, r) => s + cents(r.total), 0);
  const previousCents = previous.length ? previous.reduce((s, r) => s + cents(r.total), 0) : null;
  let partial: MonthSummary["partial"] = null;
  if (monthOf(today) === month) {
    const throughDay = Number(today.slice(8, 10));
    partial = {
      throughDay,
      previousSamePeriodCents: previous.filter((r) => Number(r.date!.slice(8, 10)) <= throughDay).reduce((s, r) => s + cents(r.total), 0),
    };
  }
  return {
    month,
    totalCents,
    trips: receipts.length,
    perTripCents: receipts.length ? Math.round(totalCents / receipts.length) : 0,
    previousMonth: shiftMonth(month, -1),
    previousCents,
    partial,
  };
}

export type CategoryRow = { slug: string; name: string; cents: number; previousCents: number; share: number };

/** Products and their discounts per category. Pfand and Leergut are left out (they're refundable, not food). */
function categoryTotals(receipts: SavedReceipt[]) {
  const totals = new Map<string, number>();
  for (const item of receipts.flatMap((r) => r.line_items)) {
    if (item.line_type !== "product" && item.line_type !== "discount") continue;
    const slug = item.category ?? UNCATEGORIZED.slug;
    totals.set(slug, (totals.get(slug) ?? 0) + cents(item.total_price));
  }
  return totals;
}

export function categoryBreakdown(receipts: SavedReceipt[], previous: SavedReceipt[]): CategoryRow[] {
  const now = categoryTotals(receipts);
  const before = categoryTotals(previous);
  const sum = [...now.values()].reduce((s, v) => s + Math.max(v, 0), 0);
  const order = [...CATEGORIES.map((c) => c.slug as string), UNCATEGORIZED.slug];
  return [...now.entries()]
    .map(([slug, value]) => ({
      slug,
      name: categoryName(slug),
      cents: value,
      previousCents: before.get(slug) ?? 0,
      share: sum ? Math.round((Math.max(value, 0) / sum) * 100) : 0,
    }))
    .sort((a, b) => b.cents - a.cents || order.indexOf(a.slug) - order.indexOf(b.slug));
}

export type ProductRow = { name: string; times: number; spentCents: number; discountCents: number; stores: string[] };

/** Products in one category, with each discount folded into the product it belongs to. */
export function categoryProducts(receipts: SavedReceipt[], slug: string): ProductRow[] {
  const rows = new Map<string, ProductRow>();
  for (const receipt of receipts) {
    let current: ProductRow | null = null;
    for (const item of receipt.line_items) {
      const inCategory = (item.category ?? UNCATEGORIZED.slug) === slug;
      if (item.line_type === "product") {
        current = null;
        if (!inCategory) continue;
        const name = item.name.trim() || item.raw_text.trim();
        const key = name.toLowerCase();
        current = rows.get(key) ?? { name, times: 0, spentCents: 0, discountCents: 0, stores: [] };
        current.times += 1;
        current.spentCents += cents(item.total_price);
        if (!current.stores.includes(receipt.store_name)) current.stores.push(receipt.store_name);
        rows.set(key, current);
      } else if (item.line_type === "discount" && inCategory && current) {
        current.spentCents += cents(item.total_price);
        current.discountCents -= cents(item.total_price);
      }
    }
  }
  return [...rows.values()].sort((a, b) => b.spentCents - a.spentCents || b.times - a.times);
}

export function monthExtras(receipts: SavedReceipt[]) {
  let pfandPaid = 0;
  let pfandReturned = 0;
  let discountsSaved = 0;
  for (const item of receipts.flatMap((r) => r.line_items)) {
    if (item.line_type === "deposit") pfandPaid += cents(item.total_price);
    if (item.line_type === "deposit_return") pfandReturned -= cents(item.total_price);
    if (item.line_type === "discount") discountsSaved -= cents(item.total_price);
  }
  return { pfandPaid, pfandReturned, discountsSaved };
}
