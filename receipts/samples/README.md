# Evaluation samples

Put your own receipt photos here, each with a hand-checked ground-truth file next to it:

```
samples/
  lidl_2026-09-28.jpg
  lidl_2026-09-28.expected.json   ← Receipt JSON, same format as the extractor's "receipt" output
  rewe_2026-10-01.png
  rewe_2026-10-01.expected.json
```

Fastest way to create ground truth:

1. Drop the photos in this folder.
2. Run `python -m receipt_extractor.eval samples/ --draft-missing`. It writes a `<name>.expected.json` draft
   for each photo that has none.
3. Open each draft next to the photo and fix every wrong value. Unchecked drafts make the eval meaningless:
   it would only measure how well Gemini agrees with itself.

Aim for 10–20 receipts across the shops you use, including hard cases: long receipts, weighed items, Pfand and
Leergut, discounts, crumpled or angled photos.

Receipts can show store addresses, dates and partial card data. Black out anything you don't want in git
before committing photos here, or keep this folder local.
