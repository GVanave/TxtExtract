EXTRACTION_PROMPT = """\
You are reading a photo of a German supermarket or drugstore receipt (Kassenbon).
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
- Never output card numbers, IBANs, terminal IDs, loyalty card numbers or other personal identifiers.
- If something is unreadable, use null where the schema allows it. Do not invent items or prices.
"""

RETRY_NOTE = """\

A previous reading of this receipt failed these consistency checks:
{issues}
Re-read the receipt carefully, paying attention to missed or duplicated lines and misread digits.
"""
