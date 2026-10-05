"""Command line: python -m receipt_extractor bill.jpg [--out bill.json]

Exit codes: 0 = extracted and all checks passed, 2 = extracted but needs review, 1 = error.
"""

import argparse
import json
import sys
from pathlib import Path

from .extractor import ExtractionError, ReceiptExtractor


def main(argv: list[str] | None = None, extractor: ReceiptExtractor | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="receipt_extractor", description="Extract a German supermarket receipt to JSON with Gemini."
    )
    parser.add_argument("image", type=Path, help="Receipt photo (jpg, png, webp, heic) or PDF.")
    parser.add_argument("--out", type=Path, help="Write the JSON here instead of printing it.")
    parser.add_argument("--model", help="Gemini model (default: $GEMINI_MODEL or gemini-2.5-flash).")
    args = parser.parse_args(argv)

    if not args.image.is_file():
        print(f"error: file not found: {args.image}", file=sys.stderr)
        return 1

    try:
        extractor = extractor or ReceiptExtractor(model=args.model)
        result = extractor.extract_file(args.image)
    except ExtractionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    output = json.dumps(result.to_dict(), indent=2, ensure_ascii=False)
    if args.out:
        args.out.write_text(output + "\n", encoding="utf-8")
    else:
        print(output)

    if result.needs_review:
        print("needs review:", *result.validation.issues, sep="\n  - ", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
