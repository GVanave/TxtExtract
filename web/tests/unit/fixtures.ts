import type { LineItem, Receipt, SavedReceipt } from "@/lib/receipt";

export function item(raw: string, total: number, extra: Partial<LineItem> = {}): LineItem {
  return { raw_text: raw, name: raw, line_type: "product", quantity: null, unit: null, unit_price: null, total_price: total, vat_code: "B", ...extra };
}

export function receipt(items: LineItem[], extra: Partial<Receipt> = {}): Receipt {
  return {
    store_name: "LIDL",
    store_address: null,
    date: "2026-10-02",
    time: "18:42",
    currency: "EUR",
    line_items: items,
    total: Math.round(items.reduce((s, i) => s + i.total_price, 0) * 100) / 100,
    payment_method: "girocard",
    vat_summary: [],
    ...extra,
  };
}

export function saved(r: Receipt, extra: Partial<SavedReceipt> = {}): SavedReceipt {
  return { ...r, id: `R-${r.store_name}-${r.date}`, saved_at: "2026-10-05 10:00:00", needs_review: false, issues: [], model: "m", image_name: null, ...extra };
}

export const LIDL_ITEMS = [
  item("BIO VOLLM. 3,8%", 1.19),
  item("BANANEN", 1.44, { quantity: 0.482, unit: "kg", unit_price: 2.99 }),
  item("PFAND 0,25", 0.25, { line_type: "deposit", vat_code: "A" }),
  item("RABATT", -0.3, { line_type: "discount" }),
  item("LEERGUT", -0.25, { line_type: "deposit_return", vat_code: "A" }),
];
