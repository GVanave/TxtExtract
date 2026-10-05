"""Evaluate the extractor on your own hand-checked receipts.

    python -m receipt_extractor.eval samples/                      # run Gemini on every sample and score it
    python -m receipt_extractor.eval samples/ --model gemini-x     # same, with another model
    python -m receipt_extractor.eval samples/ --predictions eval_runs/<run>   # re-score a saved run, no API calls
    python -m receipt_extractor.eval samples/ --draft-missing      # write <name>.expected.json drafts to correct by hand

A sample is an image (e.g. samples/lidl_0928.jpg) plus its ground truth (samples/lidl_0928.expected.json),
which is a Receipt in the same JSON format the extractor outputs.
"""

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

from .evaluation import HEADER_FIELDS, ITEM_FIELDS, ReceiptScore, score_receipt, summarize
from .extractor import MIME_TYPES, ExtractionError, ReceiptExtractor
from .schema import Receipt

EXPECTED_SUFFIX = ".expected.json"


def find_samples(samples_dir: Path) -> list[Path]:
    return sorted(p for p in samples_dir.iterdir() if p.is_file() and p.suffix.lower() in MIME_TYPES)


def _run_dir(out_dir: Path, model: str) -> Path:
    safe_model = re.sub(r"[^A-Za-z0-9._-]", "_", model)
    path = out_dir / f"{datetime.now():%Y%m%d-%H%M%S}_{safe_model}"
    path.mkdir(parents=True, exist_ok=False)
    return path


def _percent(value: float) -> str:
    return f"{value * 100:5.1f}%"


def _print_score(score: ReceiptScore) -> None:
    status = "OK   " if score.fully_correct else "WRONG"
    flag = " [flagged]" if score.flagged_for_review else ""
    wrong_header = [f for f, ok in score.header.items() if not ok]
    print(
        f"{status} {score.name:<30} items {score.matched_items}/{score.expected_items} matched, "
        f"{score.predicted_items} predicted, F1 {_percent(score.item_f1)}{flag}"
    )
    if wrong_header:
        print(f"      wrong fields: {', '.join(wrong_header)}")
    for item in score.missing_items:
        print(f"      missing: {item}")
    for item in score.extra_items:
        print(f"      extra:   {item}")


def _print_summary(summary: dict) -> None:
    print("\n=== Summary ===")
    print(f"receipts scored      {summary['receipts']}  (errors: {summary['errors']})")
    if not summary["receipts"]:
        return
    print(f"fully correct        {_percent(summary['fully_correct_rate'])}")
    for f in HEADER_FIELDS:
        print(f"  {f:<18} {_percent(summary['header_accuracy'][f])}")
    items = summary["items"]
    print(f"line items           P {_percent(items['precision'])}  R {_percent(items['recall'])}  F1 {_percent(items['f1'])}")
    for f in ITEM_FIELDS:
        print(f"  {f:<18} {_percent(items['field_accuracy'][f])}")
    print(f"  {'name similarity':<18} {_percent(items['name_similarity'])}")
    flag = summary["review_flag"]
    print(
        f"review flag          {flag['flagged']} flagged, {flag['wrong']} wrong, "
        f"{flag['wrong_and_not_flagged']} wrong but NOT flagged, {flag['flagged_but_correct']} flagged but correct"
    )
    print(f"retried              {summary['retried']}")
    if summary["avg_seconds"] is not None:
        print(f"avg time             {summary['avg_seconds']:.1f}s")


def main(argv: list[str] | None = None, extractor: ReceiptExtractor | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="receipt_extractor.eval", description="Score the extractor against hand-checked receipts."
    )
    parser.add_argument("samples", type=Path, help="Folder with receipt images and <name>.expected.json files.")
    parser.add_argument("--model", help="Gemini model to evaluate (default: $GEMINI_MODEL or gemini-2.5-flash).")
    parser.add_argument("--out-dir", type=Path, default=Path("eval_runs"), help="Where run folders are written.")
    parser.add_argument("--predictions", type=Path, help="Re-score a saved run folder instead of calling Gemini.")
    parser.add_argument("--draft-missing", action="store_true", help="Write the prediction as <name>.expected.json when missing.")
    parser.add_argument("--only", help="Only evaluate samples whose file name contains this text.")
    args = parser.parse_args(argv)

    if not args.samples.is_dir():
        print(f"error: not a folder: {args.samples}", file=sys.stderr)
        return 1
    images = [p for p in find_samples(args.samples) if not args.only or args.only in p.name]
    if not images:
        print(f"error: no receipt images found in {args.samples}", file=sys.stderr)
        return 1

    if args.predictions:
        run_dir, model = args.predictions, None
    else:
        try:
            extractor = extractor or ReceiptExtractor(model=args.model)
        except Exception as exc:  # e.g. missing API key
            print(f"error: {exc}", file=sys.stderr)
            return 1
        model = extractor.model
        run_dir = _run_dir(args.out_dir, model)

    scores, errors, skipped, drafted = [], [], [], []
    for image in images:
        name = image.stem
        expected_path = image.with_name(name + EXPECTED_SUFFIX)
        prediction_path = run_dir / f"{name}.json"

        if args.predictions:
            if not prediction_path.is_file():
                skipped.append(f"{name}: no saved prediction")
                continue
            prediction = json.loads(prediction_path.read_text(encoding="utf-8"))
        else:
            start = time.perf_counter()
            try:
                result = extractor.extract_file(image)
            except ExtractionError as exc:
                errors.append({"sample": name, "error": str(exc)})
                print(f"ERROR {name:<30} {exc}")
                continue
            prediction = result.to_dict() | {"seconds": round(time.perf_counter() - start, 2)}
            prediction_path.write_text(json.dumps(prediction, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        predicted = Receipt.model_validate(prediction["receipt"])

        if not expected_path.is_file():
            if args.draft_missing:
                expected_path.write_text(predicted.model_dump_json(indent=2) + "\n", encoding="utf-8")
                drafted.append(expected_path.name)
            else:
                skipped.append(f"{name}: no {expected_path.name}")
            continue

        expected = Receipt.model_validate_json(expected_path.read_text(encoding="utf-8"))
        score = score_receipt(
            name,
            expected,
            predicted,
            flagged_for_review=not prediction["validation"]["ok"],
            attempts=prediction.get("attempts", 1),
            seconds=prediction.get("seconds"),
        )
        scores.append(score)
        _print_score(score)

    for note in skipped:
        print(f"SKIP  {note}")
    for path in drafted:
        print(f"DRAFT {path} written: check every value against the photo before relying on it")

    summary = summarize(scores, errors=len(errors))
    _print_summary(summary)

    report = {
        "model": model or "from saved predictions",
        "created": datetime.now().isoformat(timespec="seconds"),
        "summary": summary,
        "receipts": [s.to_dict() for s in scores],
        "errors": errors,
        "skipped": skipped,
    }
    report_path = run_dir / "report.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nreport: {report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
