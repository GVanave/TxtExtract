import { describe, expect, it } from "vitest";

import { byStore, extras, monthlyTotals, overview, previousMonth, topProducts } from "@/lib/analytics";

import { item, LIDL_ITEMS, receipt, saved } from "./fixtures";

const data = [
  saved(receipt(LIDL_ITEMS, { date: "2026-09-12" }), { id: "1" }),
  saved(receipt([item("Milch", 1.19), item("Brot", 2.49)], { store_name: "Lidl", date: "2026-10-02" }), { id: "2", needs_review: true }),
  saved(receipt([item("Kaffee", 6.99), item("Milch", 1.19)], { store_name: "REWE", date: "2026-10-03" }), { id: "3" }),
];

describe("analytics", () => {
  it("summarises this and last month", () => {
    expect(overview(data, new Date(2026, 9, 5))).toEqual({
      receipts: 3,
      totalSpent: 14.19,
      avgReceipt: 4.73,
      thisMonth: 11.86,
      lastMonth: 2.33,
      needsReview: 1,
    });
  });

  it("handles January's previous month", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });

  it("groups by month and store", () => {
    expect(monthlyTotals(data)).toEqual([
      { month: "2026-09", total: 2.33, receipts: 1 },
      { month: "2026-10", total: 11.86, receipts: 2 },
    ]);
    expect(byStore(data).map((s) => [s.store, s.visits])).toEqual([
      ["REWE", 1],
      ["LIDL", 2],
    ]);
  });

  it("ranks products and ignores Pfand and discounts", () => {
    const top = topProducts(data);
    expect(top[0]).toEqual({ product: "Kaffee", timesBought: 1, spent: 6.99 });
    expect(top.find((p) => p.product === "Milch")).toEqual({ product: "Milch", timesBought: 2, spent: 2.38 });
    expect(top.map((p) => p.product)).not.toContain("PFAND 0,25");
  });

  it("totals discounts and Pfand", () => {
    expect(extras(data)).toEqual({ discountsSaved: 0.3, depositPaid: 0.25, depositReturned: 0.25, depositOpen: 0 });
  });
});
