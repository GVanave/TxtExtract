"""Spending numbers for the dashboard, computed with pandas from saved receipts and line items."""

from datetime import date

import pandas as pd


def receipts_frame(receipts: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(receipts, columns=["id", "store_name", "date", "time", "total", "needs_review", "created_at"])
    # Receipts without a printed date fall back to the day they were saved.
    df["date"] = pd.to_datetime(df["date"].fillna(df["created_at"].str[:10]), errors="coerce")
    df["month"] = df["date"].dt.to_period("M").astype(str)
    return df


def items_frame(items: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(
        items, columns=["receipt_id", "name", "raw_text", "line_type", "quantity", "unit", "total_price", "store_name", "date"]
    )
    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    return df


def overview(receipts: pd.DataFrame, today: date | None = None) -> dict:
    today = today or date.today()
    this_month = pd.Period(today, "M")
    last_month = this_month - 1
    months = receipts["date"].dt.to_period("M")
    spent_this = receipts.loc[months == this_month, "total"].sum()
    spent_last = receipts.loc[months == last_month, "total"].sum()
    return {
        "receipts": len(receipts),
        "total_spent": round(float(receipts["total"].sum()), 2),
        "avg_receipt": round(float(receipts["total"].mean()), 2) if len(receipts) else 0.0,
        "this_month": round(float(spent_this), 2),
        "last_month": round(float(spent_last), 2),
        "needs_review": int(receipts["needs_review"].sum()),
    }


def monthly_totals(receipts: pd.DataFrame) -> pd.DataFrame:
    if receipts.empty:
        return pd.DataFrame(columns=["month", "total", "receipts"])
    return (
        receipts.groupby("month", as_index=False)
        .agg(total=("total", "sum"), receipts=("id", "count"))
        .sort_values("month")
        .reset_index(drop=True)
    )


def by_store(receipts: pd.DataFrame) -> pd.DataFrame:
    if receipts.empty:
        return pd.DataFrame(columns=["store", "total", "visits", "avg_receipt"])
    df = receipts.assign(store=receipts["store_name"].str.strip().str.upper())
    out = df.groupby("store", as_index=False).agg(total=("total", "sum"), visits=("id", "count"))
    out["avg_receipt"] = out["total"] / out["visits"]
    return out.sort_values("total", ascending=False).reset_index(drop=True)


def top_products(items: pd.DataFrame, limit: int = 10) -> pd.DataFrame:
    products = items[items["line_type"] == "product"]
    if products.empty:
        return pd.DataFrame(columns=["product", "times_bought", "spent"])
    df = products.assign(product=products["name"].str.strip())
    out = df.groupby("product", as_index=False).agg(times_bought=("receipt_id", "count"), spent=("total_price", "sum"))
    return out.sort_values(["spent", "times_bought"], ascending=False).head(limit).reset_index(drop=True)


def extras(items: pd.DataFrame) -> dict:
    """Money that is not products: discounts saved and the Pfand balance."""

    def total(line_type: str) -> float:
        return round(float(items.loc[items["line_type"] == line_type, "total_price"].sum()), 2)

    deposit_paid = total("deposit")
    deposit_returned = -total("deposit_return")
    return {
        "discounts_saved": -total("discount"),
        "deposit_paid": deposit_paid,
        "deposit_returned": deposit_returned,
        "deposit_open": round(deposit_paid - deposit_returned, 2),
    }
