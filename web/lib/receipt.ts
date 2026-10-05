import { z } from "zod";

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

export type LineItem = z.infer<typeof lineItemSchema>;
export type VatEntry = z.infer<typeof vatEntrySchema>;
export type Receipt = z.infer<typeof receiptSchema>;

/** A receipt as stored in the spreadsheet. */
export type SavedReceipt = Receipt & {
  id: string;
  saved_at: string;
  needs_review: boolean;
  issues: string[];
  model: string | null;
  image_name: string | null;
};
