import type { SavedReceipt } from "./receipt";

/** Spending numbers for the dashboard. Pure functions over saved receipts. */

const round2 = (n: number) => Math.round(n * 100) / 100;

export const receiptDay = (r: SavedReceipt) => r.date ?? r.saved_at.slice(0, 10);
export const receiptMonth = (r: SavedReceipt) => receiptDay(r).slice(0, 7);

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function previousMonth(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function overview(receipts: SavedReceipt[], today = new Date()) {
  const thisMonth = monthKey(today);
  const lastMonth = previousMonth(thisMonth);
  const sum = (list: SavedReceipt[]) => round2(list.reduce((s, r) => s + r.total, 0));
  const total = sum(receipts);
  return {
    receipts: receipts.length,
    totalSpent: total,
    avgReceipt: receipts.length ? round2(total / receipts.length) : 0,
    thisMonth: sum(receipts.filter((r) => receiptMonth(r) === thisMonth)),
    lastMonth: sum(receipts.filter((r) => receiptMonth(r) === lastMonth)),
    needsReview: receipts.filter((r) => r.needs_review).length,
  };
}

export function monthlyTotals(receipts: SavedReceipt[]) {
  const map = new Map<string, { month: string; total: number; receipts: number }>();
  for (const r of receipts) {
    const month = receiptMonth(r);
    const entry = map.get(month) ?? { month, total: 0, receipts: 0 };
    entry.total = round2(entry.total + r.total);
    entry.receipts += 1;
    map.set(month, entry);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export function byStore(receipts: SavedReceipt[]) {
  const map = new Map<string, { store: string; total: number; visits: number }>();
  for (const r of receipts) {
    const store = r.store_name.trim().toUpperCase() || "UNKNOWN";
    const entry = map.get(store) ?? { store, total: 0, visits: 0 };
    entry.total = round2(entry.total + r.total);
    entry.visits += 1;
    map.set(store, entry);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function topProducts(receipts: SavedReceipt[], limit = 10) {
  const map = new Map<string, { product: string; timesBought: number; spent: number }>();
  for (const r of receipts) {
    for (const item of r.line_items) {
      if (item.line_type !== "product") continue;
      const product = item.name.trim() || item.raw_text.trim();
      const key = product.toLowerCase();
      const entry = map.get(key) ?? { product, timesBought: 0, spent: 0 };
      entry.timesBought += 1;
      entry.spent = round2(entry.spent + item.total_price);
      map.set(key, entry);
    }
  }
  return [...map.values()].sort((a, b) => b.spent - a.spent || b.timesBought - a.timesBought).slice(0, limit);
}

export function extras(receipts: SavedReceipt[]) {
  let discounts = 0;
  let depositPaid = 0;
  let depositReturned = 0;
  for (const item of receipts.flatMap((r) => r.line_items)) {
    if (item.line_type === "discount") discounts -= item.total_price;
    if (item.line_type === "deposit") depositPaid += item.total_price;
    if (item.line_type === "deposit_return") depositReturned -= item.total_price;
  }
  return {
    discountsSaved: round2(discounts),
    depositPaid: round2(depositPaid),
    depositReturned: round2(depositReturned),
    depositOpen: round2(depositPaid - depositReturned),
  };
}
