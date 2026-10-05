"""Score extracted receipts against hand-checked ground truth.

Pure functions, no API calls: compare one expected Receipt with one predicted Receipt, then aggregate.
"""

import unicodedata
from dataclasses import asdict, dataclass, field
from difflib import SequenceMatcher

from .schema import LineItem, Receipt

HEADER_FIELDS = ("store_name", "date", "time", "total", "payment_method", "item_count")
ITEM_FIELDS = ("line_type", "quantity", "unit_price", "vat_code")


def _cents(amount: float | None) -> int | None:
    return None if amount is None else round(amount * 100)


def _norm(text: str | None) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFKC", text).casefold()
    return " ".join(text.split())


def _similarity(a: str | None, b: str | None) -> float:
    a, b = _norm(a), _norm(b)
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _quantity_equal(a: float | None, b: float | None) -> bool:
    # A missing quantity means one piece on the receipt.
    return abs((a if a is not None else 1.0) - (b if b is not None else 1.0)) < 0.0005


def _item_field_equal(name: str, expected: LineItem, predicted: LineItem) -> bool:
    if name == "quantity":
        return _quantity_equal(expected.quantity, predicted.quantity)
    if name == "unit_price":
        return _cents(expected.unit_price) == _cents(predicted.unit_price) or expected.unit_price is None
    if name == "vat_code":
        return _norm(expected.vat_code) == _norm(predicted.vat_code)
    return getattr(expected, name) == getattr(predicted, name)


def match_items(expected: list[LineItem], predicted: list[LineItem]) -> list[tuple[int, int]]:
    """Pair expected and predicted lines. A pair needs the same line total; ties are broken by text similarity."""
    candidates = []
    for i, exp in enumerate(expected):
        for j, pred in enumerate(predicted):
            if _cents(exp.total_price) == _cents(pred.total_price):
                text_score = max(_similarity(exp.raw_text, pred.raw_text), _similarity(exp.name, pred.name))
                candidates.append((-text_score, abs(i - j), i, j))
    candidates.sort()

    used_expected, used_predicted, pairs = set(), set(), []
    for _, _, i, j in candidates:
        if i not in used_expected and j not in used_predicted:
            used_expected.add(i)
            used_predicted.add(j)
            pairs.append((i, j))
    return sorted(pairs)


@dataclass
class ReceiptScore:
    name: str
    header: dict[str, bool]
    expected_items: int
    predicted_items: int
    matched_items: int
    item_field_correct: dict[str, int]
    name_similarity: float
    missing_items: list[str] = field(default_factory=list)
    extra_items: list[str] = field(default_factory=list)
    flagged_for_review: bool = False
    attempts: int = 1
    seconds: float | None = None

    @property
    def item_precision(self) -> float:
        return self.matched_items / self.predicted_items if self.predicted_items else float(self.expected_items == 0)

    @property
    def item_recall(self) -> float:
        return self.matched_items / self.expected_items if self.expected_items else float(self.predicted_items == 0)

    @property
    def item_f1(self) -> float:
        p, r = self.item_precision, self.item_recall
        return 2 * p * r / (p + r) if p + r else 0.0

    @property
    def fully_correct(self) -> bool:
        """Every header field right, every line found with no extras, and every matched line's fields right."""
        return (
            all(self.header.values())
            and self.matched_items == self.expected_items == self.predicted_items
            and all(count == self.matched_items for count in self.item_field_correct.values())
        )

    def to_dict(self) -> dict:
        data = asdict(self)
        data.update(
            item_precision=self.item_precision,
            item_recall=self.item_recall,
            item_f1=self.item_f1,
            fully_correct=self.fully_correct,
        )
        return data


def score_receipt(
    name: str,
    expected: Receipt,
    predicted: Receipt,
    flagged_for_review: bool = False,
    attempts: int = 1,
    seconds: float | None = None,
) -> ReceiptScore:
    header = {
        "store_name": _similarity(expected.store_name, predicted.store_name) >= 0.8,
        "date": expected.date == predicted.date,
        "time": expected.time is None or expected.time == predicted.time,
        "total": _cents(expected.total) == _cents(predicted.total),
        "payment_method": expected.payment_method is None or _norm(expected.payment_method) == _norm(predicted.payment_method),
        "item_count": len(expected.line_items) == len(predicted.line_items),
    }

    pairs = match_items(expected.line_items, predicted.line_items)
    field_correct = {
        name_: sum(_item_field_equal(name_, expected.line_items[i], predicted.line_items[j]) for i, j in pairs)
        for name_ in ITEM_FIELDS
    }
    similarities = [_similarity(expected.line_items[i].name, predicted.line_items[j].name) for i, j in pairs]
    matched_expected = {i for i, _ in pairs}
    matched_predicted = {j for _, j in pairs}

    return ReceiptScore(
        name=name,
        header=header,
        expected_items=len(expected.line_items),
        predicted_items=len(predicted.line_items),
        matched_items=len(pairs),
        item_field_correct=field_correct,
        name_similarity=sum(similarities) / len(similarities) if similarities else 0.0,
        missing_items=[
            f"{item.raw_text} {item.total_price:.2f}" for i, item in enumerate(expected.line_items) if i not in matched_expected
        ],
        extra_items=[
            f"{item.raw_text} {item.total_price:.2f}" for j, item in enumerate(predicted.line_items) if j not in matched_predicted
        ],
        flagged_for_review=flagged_for_review,
        attempts=attempts,
        seconds=seconds,
    )


def summarize(scores: list[ReceiptScore], errors: int = 0) -> dict:
    """Aggregate per-receipt scores. Item metrics are micro-averaged over all lines."""
    count = len(scores)
    if not count:
        return {"receipts": 0, "errors": errors}

    expected = sum(s.expected_items for s in scores)
    predicted = sum(s.predicted_items for s in scores)
    matched = sum(s.matched_items for s in scores)
    precision = matched / predicted if predicted else 0.0
    recall = matched / expected if expected else 0.0

    wrong = [s for s in scores if not s.fully_correct]
    timed = [s.seconds for s in scores if s.seconds is not None]
    return {
        "receipts": count,
        "errors": errors,
        "fully_correct_rate": sum(s.fully_correct for s in scores) / count,
        "header_accuracy": {f: sum(s.header[f] for s in scores) / count for f in HEADER_FIELDS},
        "items": {
            "expected": expected,
            "predicted": predicted,
            "matched": matched,
            "precision": precision,
            "recall": recall,
            "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
            "field_accuracy": {
                f: (sum(s.item_field_correct[f] for s in scores) / matched if matched else 0.0) for f in ITEM_FIELDS
            },
            "name_similarity": sum(s.name_similarity * s.matched_items for s in scores) / matched if matched else 0.0,
        },
        "review_flag": {
            "flagged": sum(s.flagged_for_review for s in scores),
            "wrong": len(wrong),
            # The dangerous case: the extraction is wrong but passed every consistency check.
            "wrong_and_not_flagged": sum(not s.flagged_for_review for s in wrong),
            "flagged_but_correct": sum(s.flagged_for_review and s.fully_correct for s in scores),
        },
        "retried": sum(s.attempts > 1 for s in scores),
        "avg_seconds": sum(timed) / len(timed) if timed else None,
    }
