import { describe, expect, it } from "vitest";

import { isValidIsoDate, validateReceipt } from "@/lib/validation";

import { item, LIDL_ITEMS, receipt } from "./fixtures";

describe("validateReceipt", () => {
  it("passes a consistent receipt", () => {
    expect(validateReceipt(receipt(LIDL_ITEMS))).toEqual([]);
  });

  it("does not raise false alarms from float sums", () => {
    expect(validateReceipt(receipt(Array.from({ length: 30 }, (_, i) => item(`A${i}`, 0.1)), { total: 3 }))).toEqual([]);
  });

  it("flags a total mismatch", () => {
    const issues = validateReceipt(receipt(LIDL_ITEMS, { total: 9.99 }));
    expect(issues).toEqual(["Line items add up to 2.33 EUR but the receipt total is 9.99 EUR."]);
  });

  it("flags quantity x unit price mismatches but tolerates weighed rounding", () => {
    expect(validateReceipt(receipt([item("TOMATEN", 2.07, { quantity: 0.693, unit_price: 2.99 })]))).toEqual([]);
    expect(validateReceipt(receipt([item("JOGHURT", 1.58, { quantity: 3, unit_price: 0.79 })]))[0]).toContain("JOGHURT");
  });

  it("checks the VAT table against the total", () => {
    const vat = [{ code: "B", rate_percent: 7, net: null, vat: null, gross: 9.99 }];
    expect(validateReceipt(receipt([item("MILCH", 1.19)], { vat_summary: vat }))[0]).toContain("VAT table");
    const ok = [{ code: "B", rate_percent: 7, net: 1.11, vat: 0.08, gross: 1.19 }];
    expect(validateReceipt(receipt([item("MILCH", 1.19)], { vat_summary: ok }))).toEqual([]);
  });

  it("flags empty receipts and invalid dates", () => {
    expect(validateReceipt(receipt([], { total: 0 }))).toEqual(["No line items were extracted."]);
    expect(validateReceipt(receipt(LIDL_ITEMS, { date: "28.09.2026" }))[0]).toContain("Date");
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-02-28")).toBe(true);
  });
});
