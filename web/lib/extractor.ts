import "server-only";

import { extractorFromEnv, ReceiptExtractor } from "./gemini";
import type { Receipt } from "./receipt";

/** Sample answer for local UI work without a Gemini key (GEMINI_FAKE=1, never in production). */
const SAMPLE: Receipt = {
  store_name: "LIDL",
  store_address: "Hauptstraße 5, 10115 Berlin",
  date: "2026-10-02",
  time: "18:42",
  currency: "EUR",
  line_items: [
    { raw_text: "BIO VOLLM. 3,8%", name: "Bio Vollmilch 3,8%", line_type: "product", quantity: null, unit: null, unit_price: null, total_price: 1.19, vat_code: "B" },
    { raw_text: "BANANEN", name: "Bananen", line_type: "product", quantity: 0.482, unit: "kg", unit_price: 2.99, total_price: 1.44, vat_code: "B" },
    { raw_text: "MINERALW. 1,5L", name: "Mineralwasser 1,5 l", line_type: "product", quantity: null, unit: null, unit_price: null, total_price: 0.39, vat_code: "A" },
    { raw_text: "PFAND 0,25", name: "Pfand", line_type: "deposit", quantity: null, unit: null, unit_price: null, total_price: 0.25, vat_code: "A" },
    { raw_text: "JOGHURT NAT.", name: "Joghurt natur", line_type: "product", quantity: 2, unit: "pcs", unit_price: 0.79, total_price: 1.58, vat_code: "B" },
    { raw_text: "RABATT JOGHURT", name: "Rabatt Joghurt", line_type: "discount", quantity: null, unit: null, unit_price: null, total_price: -0.3, vat_code: "B" },
    { raw_text: "ROGGENBROT", name: "Roggenbrot", line_type: "product", quantity: null, unit: null, unit_price: null, total_price: 2.49, vat_code: "B" },
  ],
  total: 7.04,
  payment_method: "girocard",
  vat_summary: [],
};

export function getExtractor(): ReceiptExtractor {
  if (process.env.NODE_ENV !== "production" && process.env.GEMINI_FAKE === "1") {
    return new ReceiptExtractor({
      model: "fake-gemini",
      generate: async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
        return { text: JSON.stringify(SAMPLE) };
      },
    });
  }
  return extractorFromEnv();
}
