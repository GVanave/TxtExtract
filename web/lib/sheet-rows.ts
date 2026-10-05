import { LINE_TYPE_LABELS, LINE_TYPES, type LineItem, type LineType, type SavedReceipt } from "./receipt";

/** Pure conversions between receipts and spreadsheet rows (no I/O, so they are easy to test). */

export const RECEIPTS_TAB = "Receipts";
export const ITEMS_TAB = "Items";

export const RECEIPT_HEADERS = [
  "Receipt ID",
  "Saved at",
  "Date",
  "Time",
  "Store",
  "Address",
  "Total",
  "Currency",
  "Payment",
  "Lines",
  "Needs review",
  "Issues",
  "Model",
  "Image",
] as const;

export const ITEM_HEADERS = [
  "Receipt ID",
  "Date",
  "Store",
  "Line",
  "Printed text",
  "Product",
  "Type",
  "Quantity",
  "Unit",
  "Unit price",
  "Total",
  "VAT",
] as const;

export type Cell = string | number | boolean | null;
export type Row = Cell[];

const blank = (value: string | number | null | undefined): Cell => (value === null || value === undefined ? "" : value);

export function receiptToRow(r: SavedReceipt): Row {
  return [
    r.id,
    r.saved_at,
    blank(r.date),
    blank(r.time),
    r.store_name,
    blank(r.store_address),
    r.total,
    r.currency,
    blank(r.payment_method),
    r.line_items.length,
    r.needs_review ? "yes" : "",
    r.issues.join(" | "),
    blank(r.model),
    blank(r.image_name),
  ];
}

export function itemsToRows(r: SavedReceipt): Row[] {
  return r.line_items.map((item, index) => [
    r.id,
    blank(r.date),
    r.store_name,
    index + 1,
    item.raw_text,
    item.name,
    LINE_TYPE_LABELS[item.line_type],
    blank(item.quantity),
    blank(item.unit),
    blank(item.unit_price),
    item.total_price,
    blank(item.vat_code),
  ]);
}

// Reading back is tolerant: people may edit the sheet by hand.

const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value).trim());
const optionalText = (value: unknown): string | null => text(value) || null;

export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/\s|€/g, "");
  if (!raw) return null;
  // Accept German "1.234,56" and plain "1234.56".
  const normalised = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalised);
  return Number.isFinite(number) ? number : null;
}

const LABEL_TO_TYPE = new Map<string, LineType>(
  LINE_TYPES.flatMap((type) => [
    [type, type],
    [LINE_TYPE_LABELS[type].toLowerCase(), type],
  ]),
);

export function toLineType(value: unknown): LineType {
  return LABEL_TO_TYPE.get(text(value).toLowerCase()) ?? "product";
}

export function rowsToReceipts(receiptRows: unknown[][], itemRows: unknown[][]): SavedReceipt[] {
  const itemsById = new Map<string, { line: number; item: LineItem }[]>();
  for (const row of itemRows) {
    const id = text(row[0]);
    const total = toNumber(row[10]);
    if (!id || total === null) continue;
    const list = itemsById.get(id) ?? [];
    list.push({
      line: toNumber(row[3]) ?? list.length + 1,
      item: {
        raw_text: text(row[4]),
        name: text(row[5]) || text(row[4]),
        line_type: toLineType(row[6]),
        quantity: toNumber(row[7]),
        unit: optionalText(row[8]),
        unit_price: toNumber(row[9]),
        total_price: total,
        vat_code: optionalText(row[11]),
      },
    });
    itemsById.set(id, list);
  }

  const receipts: SavedReceipt[] = [];
  for (const row of receiptRows) {
    const id = text(row[0]);
    const total = toNumber(row[6]);
    if (!id || total === null) continue;
    const issues = text(row[11]);
    receipts.push({
      id,
      saved_at: text(row[1]),
      date: optionalText(row[2]),
      time: optionalText(row[3]),
      store_name: text(row[4]),
      store_address: optionalText(row[5]),
      total,
      currency: text(row[7]) || "EUR",
      payment_method: optionalText(row[8]),
      needs_review: ["yes", "true", "1", "x"].includes(text(row[10]).toLowerCase()),
      issues: issues ? issues.split(" | ") : [],
      model: optionalText(row[12]),
      image_name: optionalText(row[13]),
      line_items: (itemsById.get(id) ?? []).sort((a, b) => a.line - b.line).map(({ item }) => item),
      vat_summary: [],
    });
  }
  return sortNewestFirst(receipts);
}

export function sortNewestFirst(receipts: SavedReceipt[]): SavedReceipt[] {
  const key = (r: SavedReceipt) => `${r.date ?? r.saved_at.slice(0, 10)} ${r.time ?? ""} ${r.saved_at}`;
  return [...receipts].sort((a, b) => key(b).localeCompare(key(a)));
}

export function newReceiptId(now = new Date(), random = Math.random): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `R${stamp}-${Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, "0")}`;
}
