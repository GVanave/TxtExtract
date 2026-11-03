import { describe, expect, it } from "vitest";

import { MANUAL_MODEL, MANUAL_STORE, manualEntrySchema, manualReceipt } from "@/lib/manual";
import { validateReceipt } from "@/lib/validation";

// 23:30 UTC on 2 November is already 3 November in Germany.
const NOW = new Date("2026-11-02T23:30:00Z");

describe("manual entries", () => {
  it("are dated today (German time) with the time of entry", () => {
    const r = manualReceipt(manualEntrySchema.parse({ amount: 12.5 }), NOW);
    expect(r.date).toBe("2026-11-03");
    expect(r.time).toBe("00:30");
  });

  it("ignore a date sent by the browser", () => {
    const entry = manualEntrySchema.parse({ amount: 3, date: "2020-01-01" });
    expect(manualReceipt(entry, NOW).date).toBe("2026-11-03");
  });

  it("become one product line that adds up, so no warnings", () => {
    const r = manualReceipt(manualEntrySchema.parse({ amount: 4.2, what: " Brötchen ", store: "Bäckerei Müller", category: "bakery" }), NOW);
    expect(r.store_name).toBe("Bäckerei Müller");
    expect(r.total).toBe(4.2);
    expect(r.line_items).toEqual([expect.objectContaining({ name: "Brötchen", line_type: "product", total_price: 4.2, category: "bakery", category_source: "user" })]);
    expect(validateReceipt(r)).toEqual([]);
  });

  it("fill in sensible names when only the amount is given", () => {
    expect(manualReceipt(manualEntrySchema.parse({ amount: 1 }), NOW)).toMatchObject({ store_name: MANUAL_STORE, line_items: [{ name: "Einkauf", category: null }] });
    expect(manualReceipt(manualEntrySchema.parse({ amount: 1, category: "drinks" }), NOW).line_items[0].name).toBe("Getränke");
    expect(MANUAL_MODEL).toBe("manuell");
  });

  it("reject amounts that make no sense", () => {
    for (const amount of [0, -5, 1.234, 10_000.01, Number.NaN, "12"]) expect(manualEntrySchema.safeParse({ amount }).success).toBe(false);
    expect(manualEntrySchema.safeParse({ amount: 1, category: "made-up" }).success).toBe(false);
    expect(manualEntrySchema.safeParse({ amount: 0.1 + 0.2 }).success).toBe(true); // 0.30000000000000004 is still 0,30 €
  });
});
