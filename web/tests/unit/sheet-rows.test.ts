import { describe, expect, it } from "vitest";

import { ITEM_HEADERS, itemsToRows, newReceiptId, RECEIPT_HEADERS, receiptToRow, rowsToReceipts, toNumber } from "@/lib/sheet-rows";

import { LIDL_ITEMS, receipt, saved } from "./fixtures";

describe("sheet rows", () => {
  it("round-trips receipts through rows", () => {
    const a = saved(receipt(LIDL_ITEMS), { id: "A", needs_review: true, issues: ["one", "two"] });
    const b = saved(receipt(LIDL_ITEMS.slice(0, 2), { store_name: "REWE", date: "2026-09-01" }), { id: "B" });
    const back = rowsToReceipts([receiptToRow(a), receiptToRow(b)], [...itemsToRows(b), ...itemsToRows(a)]);
    expect(back).toEqual([a, b]); // newest first
  });

  it("matches the header widths", () => {
    const r = saved(receipt(LIDL_ITEMS));
    expect(receiptToRow(r)).toHaveLength(RECEIPT_HEADERS.length);
    expect(itemsToRows(r)[0]).toHaveLength(ITEM_HEADERS.length);
  });

  it("writes readable type labels", () => {
    expect(itemsToRows(saved(receipt(LIDL_ITEMS))).map((row) => row[6])).toEqual(["Product", "Product", "Pfand", "Discount", "Leergut"]);
  });

  it("reads hand-edited sheets tolerantly", () => {
    const receipts = [["X", "2026-10-01 09:00:00", "2026-10-01", "", "Edeka", "", "3,50 €", "", "", 1, "YES", "", "", ""], ["", "", "", "", "", "", "1"], ["Y", "", "", "", "Nope", "", "abc"]];
    const items = [["X", "", "", "", "BROT", "", "pfand", "", "", "", "3,5", ""]];
    const [r] = rowsToReceipts(receipts, items);
    expect(rowsToReceipts(receipts, items)).toHaveLength(1);
    expect(r).toMatchObject({ id: "X", total: 3.5, needs_review: true, currency: "EUR", time: null });
    expect(r.line_items[0]).toMatchObject({ name: "BROT", line_type: "deposit", total_price: 3.5 });
  });

  it("parses numbers", () => {
    expect(toNumber(2)).toBe(2);
    expect(toNumber("1.234,56")).toBe(1234.56);
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber("")).toBeNull();
  });

  it("makes sortable, unique-ish ids", () => {
    expect(newReceiptId(new Date("2026-10-02T18:42:05Z"), () => 0.5)).toBe("R20261002-184205-i000");
  });
});
