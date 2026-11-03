import { z } from "zod";

import { CATEGORY_SLUGS, categoryName } from "./categories";
import { APP_TIME_ZONE, todayIso } from "./dates";
import type { Receipt, SavedReceipt } from "./receipt";

/**
 * Purchases entered by hand, without a receipt photo and without Gemini. They are stored like a receipt with one
 * line, so totals, charts, categories and the Excel export all include them. The date is always the day of entry:
 * the server sets it, the browser cannot choose it.
 */

/** Stored in the receipt's `model` column, so hand entries can be recognised later. */
export const MANUAL_MODEL = "manuell";
export const MANUAL_STORE = "Ohne Kassenbon";
export const MAX_MANUAL_AMOUNT = 10_000;

export const isManual = (receipt: Pick<SavedReceipt, "model">) => receipt.model === MANUAL_MODEL;

export const manualEntrySchema = z.object({
  amount: z
    .number()
    .finite()
    .positive()
    .max(MAX_MANUAL_AMOUNT)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "höchstens zwei Nachkommastellen"),
  what: z.string().trim().max(80).default(""),
  store: z.string().trim().max(80).default(""),
  category: z.enum(CATEGORY_SLUGS).nullable().default(null),
});
export type ManualEntry = z.infer<typeof manualEntrySchema>;

/** Time of day in German time, "18:42". */
export function nowTime(now = new Date(), timeZone = APP_TIME_ZONE): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

export function manualReceipt(entry: ManualEntry, now = new Date()): Receipt {
  const name = entry.what || (entry.category ? categoryName(entry.category) : "Einkauf");
  return {
    store_name: entry.store || MANUAL_STORE,
    store_address: null,
    date: todayIso(now),
    time: nowTime(now),
    currency: "EUR",
    payment_method: null,
    vat_summary: [],
    total: entry.amount,
    line_items: [
      {
        raw_text: name,
        name,
        line_type: "product",
        quantity: null,
        unit: null,
        unit_price: null,
        total_price: entry.amount,
        vat_code: null,
        category: entry.category,
        category_source: entry.category ? "user" : null,
      },
    ],
  };
}
