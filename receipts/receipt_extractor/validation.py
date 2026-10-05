"""Deterministic checks on an extracted receipt. The model reads; this code does the maths."""

from dataclasses import dataclass, field
from datetime import date

from .schema import Receipt

# One cent, with a little slack for float representation.
TOLERANCE = 0.011
# Weighed items are rounded per line, so allow a bit more for quantity x unit price.
LINE_TOLERANCE = 0.02


@dataclass
class ValidationResult:
    issues: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues


def _cents(amount: float) -> int:
    return round(amount * 100)


def validate_receipt(receipt: Receipt) -> ValidationResult:
    result = ValidationResult()

    if not receipt.line_items:
        result.issues.append("No line items were extracted.")

    items_sum = sum(_cents(item.total_price) for item in receipt.line_items)
    total = _cents(receipt.total)
    if abs(items_sum - total) / 100 > TOLERANCE:
        result.issues.append(f"Line items add up to {items_sum / 100:.2f} EUR but the receipt total is {total / 100:.2f} EUR.")

    for index, item in enumerate(receipt.line_items, start=1):
        if item.quantity is not None and item.unit_price is not None:
            expected = item.quantity * item.unit_price
            if abs(expected - item.total_price) > LINE_TOLERANCE:
                result.issues.append(
                    f"Line {index} '{item.raw_text}': {item.quantity} x {item.unit_price:.2f} = {expected:.2f}, "
                    f"but the line total is {item.total_price:.2f}."
                )

    gross_values = [entry.gross for entry in receipt.vat_summary if entry.gross is not None]
    if gross_values:
        vat_gross = sum(_cents(value) for value in gross_values)
        # Deposit returns sometimes sit outside the VAT table, so only flag a mismatch against both sums.
        if vat_gross != total and vat_gross != items_sum:
            result.issues.append(f"VAT table gross sum {vat_gross / 100:.2f} EUR does not match the total {total / 100:.2f} EUR.")

    if receipt.date is not None:
        try:
            date.fromisoformat(receipt.date)
        except ValueError:
            result.issues.append(f"Date '{receipt.date}' is not a valid YYYY-MM-DD date.")

    return result
