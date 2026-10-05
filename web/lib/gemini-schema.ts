import "server-only";

import { Type, type Schema } from "@google/genai";

import { LINE_TYPES } from "./receipt";

const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });

/**
 * The same shape as `receiptSchema`, as the OpenAPI-style schema Gemini's structured output accepts.
 * Kept by hand (rather than generated) so it stays inside the subset Gemini supports.
 */
export const GEMINI_RECEIPT_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    store_name: { type: Type.STRING, description: "Chain name, e.g. 'LIDL', 'ALDI SÜD', 'REWE'." },
    store_address: nullable({ type: Type.STRING }),
    date: nullable({ type: Type.STRING, description: "Purchase date as YYYY-MM-DD." }),
    time: nullable({ type: Type.STRING, description: "Purchase time as HH:MM." }),
    currency: { type: Type.STRING, description: "ISO currency code, normally 'EUR'." },
    line_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          raw_text: { type: Type.STRING, description: "Item text exactly as printed, e.g. 'BIO VOLLM. 3,8%'." },
          name: { type: Type.STRING, description: "Readable German product name, e.g. 'Bio Vollmilch 3,8%'." },
          line_type: { type: Type.STRING, enum: [...LINE_TYPES] },
          quantity: nullable({ type: Type.NUMBER, description: "Pieces or weight. Null if not printed." }),
          unit: nullable({ type: Type.STRING, description: "'pcs', 'kg', 'g', 'l' or null." }),
          unit_price: nullable({ type: Type.NUMBER, description: "Price per piece or unit in EUR, if printed." }),
          total_price: { type: Type.NUMBER, description: "Line total in EUR. Negative for discounts and Leergut." },
          vat_code: nullable({ type: Type.STRING, description: "VAT letter at the end of the line, e.g. 'A' or 'B'." }),
        },
        required: ["raw_text", "name", "line_type", "quantity", "unit", "unit_price", "total_price", "vat_code"],
      },
    },
    total: { type: Type.NUMBER, description: "Final amount paid ('Summe' / 'zu zahlen') in EUR." },
    payment_method: nullable({ type: Type.STRING, description: "'cash', 'girocard', 'credit_card' or similar. No card numbers." }),
    vat_summary: {
      type: Type.ARRAY,
      description: "Rows of the MwSt/VAT table at the bottom. Empty if not printed.",
      items: {
        type: Type.OBJECT,
        properties: {
          code: { type: Type.STRING },
          rate_percent: { type: Type.NUMBER },
          net: nullable({ type: Type.NUMBER }),
          vat: nullable({ type: Type.NUMBER }),
          gross: nullable({ type: Type.NUMBER }),
        },
        required: ["code", "rate_percent", "net", "vat", "gross"],
      },
    },
  },
  required: ["store_name", "store_address", "date", "time", "currency", "line_items", "total", "payment_method", "vat_summary"],
};
