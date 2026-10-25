import { z } from "zod";

import { CATEGORY_SLUGS, CATEGORY_SOURCES } from "./categories";

export const LINE_TYPES = ["product", "deposit", "deposit_return", "discount", "other"] as const;
export type LineType = (typeof LINE_TYPES)[number];

export const LINE_TYPE_LABELS: Record<LineType, string> = {
  product: "Product",
  deposit: "Pfand",
  deposit_return: "Leergut",
  discount: "Discount",
  other: "Other",
};

const money = z.number().finite();

export const lineItemSchema = z.object({
  raw_text: z.string(),
  name: z.string(),
  line_type: z.enum(LINE_TYPES),
  quantity: z.number().finite().nullable(),
  unit: z.string().nullable(),
  unit_price: money.nullable(),
  total_price: money,
  vat_code: z.string().nullable(),
  // Only product lines have a category; discounts inherit the category of the product above them on save.
  // An unknown category from the model becomes "no category" instead of rejecting the whole receipt.
  category: z.preprocess((v) => ((CATEGORY_SLUGS as readonly unknown[]).includes(v) ? v : null), z.enum(CATEGORY_SLUGS).nullable()),
  category_source: z.enum(CATEGORY_SOURCES).nullable().optional().transform((v) => v ?? null),
});

export const vatEntrySchema = z.object({
  code: z.string(),
  rate_percent: z.number().finite(),
  net: money.nullable(),
  vat: money.nullable(),
  gross: money.nullable(),
});

export const receiptSchema = z.object({
  store_name: z.string(),
  store_address: z.string().nullable(),
  date: z.string().nullable(),
  time: z.string().nullable(),
  currency: z.string(),
  line_items: z.array(lineItemSchema),
  total: money,
  payment_method: z.string().nullable(),
  vat_summary: z.array(vatEntrySchema),
});

export type LineItem = z.output<typeof lineItemSchema>;
export type VatEntry = z.infer<typeof vatEntrySchema>;
export type Receipt = z.output<typeof receiptSchema>;

export type SavedLineItem = LineItem & { id: string };

/** A receipt as stored in the database (amounts converted back to euros). */
export type SavedReceipt = Omit<Receipt, "line_items"> & {
  line_items: SavedLineItem[];
  id: string;
  store_id: string;
  /** The store name exactly as printed; `store_name` is the unified name, e.g. "LIDL". */
  store_raw: string;
  saved_at: string;
  needs_review: boolean;
  issues: string[];
  model: string | null;
  image_name: string | null;
};
