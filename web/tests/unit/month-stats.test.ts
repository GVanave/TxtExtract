import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { shiftMonth, todayIso } from "@/lib/dates";
import { receiptsWorkbook } from "@/lib/export";
import { categoryBreakdown, categoryProducts, chartMonths, monthExtras, monthSummary } from "@/lib/month-stats";

import { item, receipt, saved } from "./fixtures";

const snacks = { category: "snacks" as const };
const sep = [
  saved(
    receipt(
      [
        item("SCHOKOLADE", 1.29, { name: "Schokolade", ...snacks }),
        item("RABATT SCHOKO", -0.39, { line_type: "discount", category: "snacks" }),
        item("MILCH", 1.19, { name: "Milch", category: "dairy" }),
        item("PFAND", 0.25, { line_type: "deposit" }),
      ],
      { date: "2026-09-05" },
    ),
  ),
  saved(receipt([item("SCHOKOLADE", 1.29, { name: "Schokolade", ...snacks }), item("BROT", 2.49, { name: "Brot" })], { store_name: "REWE", date: "2026-09-28" })),
];
const oct = [
  saved(receipt([item("CHIPS", 1.79, { name: "Chips", ...snacks }), item("LEERGUT", -0.75, { line_type: "deposit_return" })], { date: "2026-10-03" })),
];

describe("chartMonths", () => {
  const totals = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((month, i) => ({ month, totalCents: (i + 1) * 1000, trips: i + 1 }));

  it("keeps the last 5 months and averages only the finished ones", () => {
    const { bars, averageCents, averageOf } = chartMonths(totals, "2026-10-24");
    expect(bars.map((b) => b.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
    expect(bars.at(-1)!.current).toBe(true);
    expect(averageOf).toBe(4);
    expect(averageCents).toBe(3500); // (20+30+40+50)/4 €, October left out because it is still running
  });

  it("works with fewer months and with only the running month", () => {
    expect(chartMonths(totals.slice(0, 2), "2026-10-24").bars).toHaveLength(2);
    expect(chartMonths([{ month: "2026-10", totalCents: 100, trips: 1 }], "2026-10-24").averageCents).toBeNull();
  });
});

describe("monthSummary", () => {
  it("compares a finished month with the whole previous month", () => {
    const s = monthSummary("2026-10", oct, sep, "2026-11-02");
    expect(s).toMatchObject({ totalCents: 104, trips: 1, previousMonth: "2026-09", previousCents: 612, partial: null });
  });

  it("compares the running month with the same days of the previous month", () => {
    const s = monthSummary("2026-10", oct, sep, "2026-10-10");
    expect(s.partial).toEqual({ throughDay: 10, previousSamePeriodCents: 234 }); // only the 5 Sep receipt
  });

  it("handles a month without a previous month", () => {
    expect(monthSummary("2026-09", sep, [], "2026-10-10").previousCents).toBeNull();
  });
});

describe("categories", () => {
  it("sums products with their discounts and leaves Pfand out", () => {
    const rows = categoryBreakdown(sep, oct);
    expect(rows.map((r) => [r.slug, r.cents, r.previousCents])).toEqual([
      ["uncategorized", 249, 0],
      ["snacks", 219, 179],
      ["dairy", 119, 0],
    ]);
    expect(Math.abs(rows.reduce((s, r) => s + r.share, 0) - 100)).toBeLessThanOrEqual(1); // rounded shares
    expect(rows[0].name).toBe("Nicht zugeordnet");
  });

  it("folds each discount into its product", () => {
    expect(categoryProducts(sep, "snacks")).toEqual([
      { name: "Schokolade", times: 2, spentCents: 219, discountCents: 39, stores: ["LIDL", "REWE"] },
    ]);
  });

  it("totals Pfand, Leergut and discounts", () => {
    expect(monthExtras([...sep, ...oct])).toEqual({ pfandPaid: 25, pfandReturned: 75, discountsSaved: 39 });
  });
});

describe("dates", () => {
  it("shifts months across years and takes today in German time", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(todayIso(new Date("2026-10-31T23:30:00Z"), "Europe/Berlin")).toBe("2026-11-01");
  });
});

describe("Excel export", () => {
  it("writes a Receipts and an Items sheet with real numbers and dates", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await receiptsWorkbook(sep)) as unknown as ArrayBuffer); // exceljs typings predate Buffer<T>
    const receipts = book.getWorksheet("Receipts")!;
    const items = book.getWorksheet("Items")!;
    expect(receipts.rowCount).toBe(3);
    expect(items.rowCount).toBe(7);
    expect(receipts.getRow(1).getCell(1).value).toBe("Date");
    expect(receipts.getRow(2).getCell(5).value).toBe(2.34);
    expect((receipts.getRow(2).getCell(1).value as Date).toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(items.getRow(2).getCell(7).value).toBe("Snacks & Süßes");
    expect(items.getRow(5).getCell(6).value).toBe("Pfand");
    expect(items.getRow(5).getCell(7).value).toBe("");
  });
});
