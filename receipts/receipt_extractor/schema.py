"""Structured output returned by the extractor.

These models double as the JSON schema sent to Gemini, so they stay simple:
no defaults, no custom validators, plain floats for euro amounts.
"""

from enum import StrEnum

from pydantic import BaseModel, Field


class LineType(StrEnum):
    PRODUCT = "product"
    DEPOSIT = "deposit"  # Pfand charged on a bottle/can
    DEPOSIT_RETURN = "deposit_return"  # Leergut / Pfandbon refund (negative)
    DISCOUNT = "discount"  # Rabatt, Preisvorteil, Coupon (negative)
    OTHER = "other"  # e.g. carrier bag fee


class LineItem(BaseModel):
    raw_text: str = Field(description="The item text exactly as printed on the receipt, e.g. 'BIO VOLLM. 3,8%'.")
    name: str = Field(description="Readable German product name with abbreviations expanded, e.g. 'Bio Vollmilch 3,8%'.")
    line_type: LineType
    quantity: float | None = Field(description="Number of pieces or weight. Null if not printed (implies 1 piece).")
    unit: str | None = Field(description="'pcs', 'kg', 'g', 'l' or null.")
    unit_price: float | None = Field(description="Price per piece or per unit in EUR, if printed.")
    total_price: float = Field(description="Line total in EUR. Negative for discounts and deposit returns.")
    vat_code: str | None = Field(description="VAT letter printed at the end of the line, e.g. 'A' or 'B'.")


class VatEntry(BaseModel):
    code: str = Field(description="VAT letter, e.g. 'A'.")
    rate_percent: float = Field(description="VAT rate, e.g. 19 or 7.")
    net: float | None
    vat: float | None
    gross: float | None


class Receipt(BaseModel):
    store_name: str = Field(description="Chain name, e.g. 'LIDL', 'ALDI SÜD', 'REWE'.")
    store_address: str | None
    date: str | None = Field(description="Purchase date as YYYY-MM-DD.")
    time: str | None = Field(description="Purchase time as HH:MM.")
    currency: str = Field(description="ISO currency code, normally 'EUR'.")
    line_items: list[LineItem]
    total: float = Field(description="Final amount paid ('Summe' / 'zu zahlen') in EUR.")
    payment_method: str | None = Field(description="'cash', 'girocard', 'credit_card', or other short label. No card numbers.")
    vat_summary: list[VatEntry] = Field(description="Rows of the MwSt/VAT table at the bottom. Empty if not printed.")
