import { CATEGORIES } from "./categories";

export const EXTRACTION_PROMPT = `You are reading a photo of a German supermarket or drugstore receipt (Kassenbon).
Extract it into the given JSON schema. Rules:

- One entry in line_items per printed price line, in printed order. Copy the printed text into raw_text.
- Amounts use a comma as the decimal separator on the receipt ("12,49"); output them as numbers (12.49).
- Weighed items ("0,482 kg x 2,99 EUR/kg") and multiples ("2 x 1,29") belong to the product line they
  describe: set quantity, unit and unit_price on that product, do not create a separate line for them.
- Pfand lines (deposit charged) are line_type "deposit". Leergut / Pfandbon refunds are "deposit_return"
  with a negative total_price.
- Rabatt, Preisvorteil, Coupon, Lidl Plus or similar reductions are line_type "discount" with a negative
  total_price, as their own line.
- Do not include subtotal, total, payment, change (Rückgeld) or VAT table rows in line_items.
- total is the final amount paid ("Summe", "zu zahlen", "Gesamt").
- vat_summary comes from the MwSt table at the bottom, if printed.
- category: for every product line, pick the best fitting category for what the product is (Pfand, Leergut,
  discounts and other non-product lines get null). Drugstore and cleaning items are "household"; use "other"
  only when nothing fits.
- Never output card numbers, IBANs, terminal IDs, loyalty card numbers or other personal identifiers.
- If something is unreadable, use null where the schema allows it. Do not invent items or prices.
`;

export const retryNote = (issues: string[]) => `
A previous reading of this receipt failed these consistency checks:
${issues.map((issue) => `- ${issue}`).join("\n")}
Re-read the receipt carefully, paying attention to missed or duplicated lines and misread digits.
`;

export const categorizePrompt = (names: string[]) => `These are product lines from German supermarket receipts.
For each line, in the same order, return the best fitting category slug. Drugstore and cleaning items are
"household"; use "other" only when nothing fits.
Categories: ${CATEGORIES.map((c) => `${c.slug} = ${c.name}`).join("; ")}.

Lines:
${names.map((n, i) => `${i + 1}. ${n}`).join("\n")}
`;
