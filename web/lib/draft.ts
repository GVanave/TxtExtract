import { LINE_TYPES, type LineType, type Receipt } from "./receipt";

/**
 * The review form keeps numbers as text while you type ("1," is a valid moment), and converts back to a
 * Receipt for checking and saving. Pure functions, shared by the browser and tests.
 */

export type DraftItem = {
  key: string;
  raw_text: string;
  name: string;
  line_type: LineType;
  quantity: string;
  unit: string;
  unit_price: string;
  total_price: string;
  vat_code: string;
};

export type Draft = {
  store_name: string;
  store_address: string;
  date: string;
  time: string;
  total: string;
  payment_method: string;
  currency: string;
  items: DraftItem[];
};

let counter = 0;
export const newKey = () => `item-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const numText = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));
/** Money always with two decimals: -0.3 -> "-0,30". */
const moneyText = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

export function receiptToDraft(r: Receipt): Draft {
  return {
    store_name: r.store_name,
    store_address: r.store_address ?? "",
    date: r.date ?? "",
    time: r.time ?? "",
    total: moneyText(r.total),
    payment_method: r.payment_method ?? "",
    currency: r.currency || "EUR",
    items: r.line_items.map((item) => ({
      key: newKey(),
      raw_text: item.raw_text,
      name: item.name,
      line_type: item.line_type,
      quantity: numText(item.quantity),
      unit: item.unit ?? "",
      unit_price: moneyText(item.unit_price),
      total_price: moneyText(item.total_price),
      vat_code: item.vat_code ?? "",
    })),
  };
}

export function emptyItem(): DraftItem {
  return { key: newKey(), raw_text: "", name: "", line_type: "product", quantity: "", unit: "", unit_price: "", total_price: "", vat_code: "" };
}

/** Parses "1,99", "1.99", "-0,30", "1.234,56". Returns undefined for invalid text, null for empty. */
export function parseAmount(text: string): number | null | undefined {
  const raw = text.replace(/\s|€/g, "");
  if (!raw) return null;
  const normalised = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^-?\d+(\.\d+)?$/.test(normalised)) return undefined;
  return Number(normalised);
}

const clean = (s: string) => s.trim() || null;

export function draftToReceipt(draft: Draft): { receipt: Receipt | null; problems: string[] } {
  const problems: string[] = [];
  if (!draft.store_name.trim()) problems.push("The store name is empty.");

  const total = parseAmount(draft.total);
  if (total === null || total === undefined) problems.push("The receipt total is not a valid amount.");

  const items: Receipt["line_items"] = [];
  draft.items.forEach((item, index) => {
    const isEmpty = !item.name.trim() && !item.raw_text.trim() && !item.total_price.trim();
    if (isEmpty) return;
    const label = `Line ${index + 1}${item.name ? ` (${item.name})` : ""}`;
    const lineTotal = parseAmount(item.total_price);
    const quantity = parseAmount(item.quantity);
    const unitPrice = parseAmount(item.unit_price);
    if (lineTotal === null || lineTotal === undefined) problems.push(`${label}: the total is not a valid amount.`);
    if (quantity === undefined) problems.push(`${label}: the quantity is not a number.`);
    if (unitPrice === undefined) problems.push(`${label}: the unit price is not a valid amount.`);
    if (lineTotal === null || lineTotal === undefined || quantity === undefined || unitPrice === undefined) return;
    const text = item.raw_text.trim() || item.name.trim();
    items.push({
      raw_text: text,
      name: item.name.trim() || text,
      line_type: LINE_TYPES.includes(item.line_type) ? item.line_type : "product",
      quantity,
      unit: clean(item.unit),
      unit_price: unitPrice,
      total_price: Math.round(lineTotal * 100) / 100,
      vat_code: clean(item.vat_code),
    });
  });

  if (problems.length) return { receipt: null, problems };
  return {
    receipt: {
      store_name: draft.store_name.trim(),
      store_address: clean(draft.store_address),
      date: clean(draft.date),
      time: clean(draft.time),
      currency: draft.currency || "EUR",
      line_items: items,
      total: Math.round((total as number) * 100) / 100,
      payment_method: clean(draft.payment_method),
      vat_summary: [],
    },
    problems: [],
  };
}
