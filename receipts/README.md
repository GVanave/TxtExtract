# Receipt extractor

Turns a photo of a German supermarket receipt (Kassenbon) into structured JSON using a Gemini vision model.
This is step 1 of a spending and nutrition tracker; categorization, calories and suggestions come later as
separate modules.

```
receipt photo → Gemini (one call, JSON schema) → Receipt → deterministic checks → JSON (+ "needs review" flag)
```

Gemini only reads the receipt. The maths is checked in plain Python (`validation.py`):

- line items (products, Pfand, Leergut, discounts) must add up to the printed total
- quantity × unit price must match each line total (e.g. `0,482 kg x 2,99 EUR/kg`)
- the MwSt/VAT table must match the total, when printed
- the date must be a valid `YYYY-MM-DD`

If a check fails, Gemini is asked once more with the list of problems. If the second reading still fails, the
result is returned with `validation.ok = false` so you can review it instead of trusting wrong numbers.

## Setup

```bash
cd receipts
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
export GEMINI_API_KEY=your-key          # from https://aistudio.google.com/apikey
export GEMINI_MODEL=gemini-2.5-flash    # optional, this is the default
```

## Usage

```bash
python -m receipt_extractor bon.jpg               # print JSON
python -m receipt_extractor bon.jpg --out bon.json
```

Exit codes: `0` all checks passed, `2` extracted but needs review, `1` error (bad file, API error, invalid output).

From Python:

```python
from receipt_extractor import ReceiptExtractor

result = ReceiptExtractor().extract_file("bon.jpg")
print(result.receipt.total, result.validation.issues)
```

Supported files: jpg, png, webp, heic/heif, pdf.

## Output

```json
{
  "receipt": {
    "store_name": "LIDL",
    "date": "2026-09-28",
    "time": "18:42",
    "currency": "EUR",
    "line_items": [
      {"raw_text": "BANANEN", "name": "Bananen", "line_type": "product",
       "quantity": 0.482, "unit": "kg", "unit_price": 2.99, "total_price": 1.44, "vat_code": "B"},
      {"raw_text": "PFAND 0,25", "name": "Pfand", "line_type": "deposit",
       "quantity": null, "unit": null, "unit_price": null, "total_price": 0.25, "vat_code": "A"}
    ],
    "total": 1.69,
    "payment_method": "girocard",
    "vat_summary": []
  },
  "validation": {"ok": true, "issues": []},
  "model": "gemini-2.5-flash",
  "attempts": 1
}
```

`line_type` is one of `product`, `deposit` (Pfand), `deposit_return` (Leergut, negative), `discount` (negative), `other`.
The prompt tells the model not to output card numbers, IBANs or loyalty IDs.

## Evaluation

Measures extraction quality on your own hand-checked receipts, so you can tell whether a prompt or model change
made things better or worse. See [`samples/README.md`](samples/README.md) for how to build the sample set.

```bash
python -m receipt_extractor.eval samples/ --draft-missing        # first time: draft ground truth, then fix it by hand
python -m receipt_extractor.eval samples/                        # run Gemini on every sample and score it
python -m receipt_extractor.eval samples/ --model gemini-2.5-pro # compare another model
python -m receipt_extractor.eval samples/ --predictions eval_runs/<run>   # re-score a saved run, no API calls
python -m receipt_extractor.eval samples/ --only lidl            # just the matching samples
```

Each run is saved to `eval_runs/<timestamp>_<model>/` (git-ignored): one prediction JSON per receipt plus
`report.json`. The console shows each receipt (missing/extra lines, wrong fields) and a summary:

| Metric | Meaning |
|--------|---------|
| fully correct | Every header field right, every line found with no extras, every line's fields right |
| header accuracy | store, date, time, total, payment method, number of lines |
| line items P / R / F1 | Lines matched by equal total price (ties broken by text similarity) |
| item field accuracy | line type, quantity, unit price, VAT code on matched lines |
| name similarity | How close the readable names are to yours (0–100%) |
| wrong but NOT flagged | **The number to watch**: wrong extractions that passed every consistency check |

## Tests

```bash
pytest        # uses a fake Gemini client, no API key or network needed
ruff check .
```
