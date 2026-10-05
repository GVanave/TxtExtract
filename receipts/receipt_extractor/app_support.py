"""Glue between the Streamlit UI and the extractor: building it, and turning edited tables back into a Receipt."""

import math
from datetime import date

from pydantic import ValidationError

from .extractor import ReceiptExtractor
from .schema import LineItem, LineType, Receipt

ITEM_COLUMNS = ["raw_text", "name", "line_type", "quantity", "unit", "unit_price", "total_price", "vat_code"]


def build_extractor(model: str | None) -> ReceiptExtractor:
    return ReceiptExtractor(model=model or None)


def _clean(value):
    """Data-editor cells come back as NaN/None/'' for empty; normalise to None."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, str) and not value.strip():
        return None
    return value


def items_to_rows(receipt: Receipt) -> list[dict]:
    return [
        {column: getattr(item, column) for column in ITEM_COLUMNS} | {"line_type": item.line_type.value}
        for item in receipt.line_items
    ]


def rows_to_receipt(
    rows: list[dict],
    *,
    store_name: str,
    purchase_date: date | None,
    time: str | None,
    total: float,
    payment_method: str | None,
    base: Receipt,
) -> tuple[Receipt | None, list[str]]:
    """Rebuild a Receipt from the edited form. Returns (receipt, problems that prevent building it)."""
    problems, items = [], []
    for number, raw in enumerate(rows, start=1):
        row = {key: _clean(raw.get(key)) for key in ITEM_COLUMNS}
        if all(value is None for value in row.values()):
            continue  # empty row added in the editor
        if row["total_price"] is None:
            problems.append(f"Row {number}: the line total is empty.")
            continue
        text = row["raw_text"] or row["name"] or ""
        try:
            items.append(
                LineItem(
                    raw_text=text,
                    name=row["name"] or text,
                    line_type=LineType(row["line_type"] or LineType.PRODUCT.value),
                    quantity=row["quantity"],
                    unit=row["unit"],
                    unit_price=row["unit_price"],
                    total_price=round(float(row["total_price"]), 2),
                    vat_code=row["vat_code"],
                )
            )
        except (ValidationError, ValueError) as exc:
            problems.append(f"Row {number}: {exc}")

    if not store_name.strip():
        problems.append("The store name is empty.")
    if problems:
        return None, problems

    receipt = base.model_copy(
        update={
            "store_name": store_name.strip(),
            "date": purchase_date.isoformat() if purchase_date else None,
            "time": _clean(time),
            "total": round(float(total), 2),
            "payment_method": _clean(payment_method),
            "line_items": items,
        }
    )
    return receipt, []


def parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def euro(amount: float | None) -> str:
    """German-style money formatting: 1.234,56 €."""
    if amount is None:
        return "–"
    text = f"{amount:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{text} €"
