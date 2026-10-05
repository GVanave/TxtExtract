from datetime import date

from receipt_extractor import LineItem, LineType, Receipt
from receipt_extractor import analytics as an
from receipt_extractor.store import ReceiptStore


def item(text, total, line_type=LineType.PRODUCT):
    return LineItem(
        raw_text=text,
        name=text.title(),
        line_type=line_type,
        quantity=None,
        unit=None,
        unit_price=None,
        total_price=total,
        vat_code="B",
    )


def receipt(store, day, items, time="10:00"):
    return Receipt(
        store_name=store,
        store_address=None,
        date=day,
        time=time,
        currency="EUR",
        line_items=items,
        total=round(sum(i.total_price for i in items), 2),
        payment_method="girocard",
        vat_summary=[],
    )


def filled_store(tmp_path):
    store = ReceiptStore(tmp_path / "test.db")
    store.save(
        receipt(
            "LIDL",
            "2026-09-12",
            [item("MILCH", 1.19), item("PFAND", 0.25, LineType.DEPOSIT), item("RABATT", -0.20, LineType.DISCOUNT)],
        ),
        issues=[],
        model="m",
        image_name="a.jpg",
    )
    store.save(receipt("Lidl", "2026-10-02", [item("MILCH", 1.19), item("BROT", 2.49)]), issues=["check me"], model="m")
    store.save(receipt("REWE", "2026-10-03", [item("KAFFEE", 6.99), item("LEERGUT", -0.25, LineType.DEPOSIT_RETURN)]), issues=[])
    return store


def test_save_list_get_delete(tmp_path):
    store = filled_store(tmp_path)

    listed = store.list_receipts()
    assert [r["store_name"] for r in listed] == ["REWE", "Lidl", "LIDL"]  # newest first
    assert listed[1]["needs_review"] is True
    assert listed[1]["issues"] == ["check me"]

    meta, saved = store.get(listed[2]["id"])
    assert meta["image_name"] == "a.jpg"
    assert saved.line_items[2].line_type is LineType.DISCOUNT
    assert saved.total == 1.24

    assert len(store.all_line_items()) == 7
    assert store.delete(listed[0]["id"]) is True
    assert store.get(listed[0]["id"]) is None
    assert len(store.all_line_items()) == 5  # lines removed with their receipt
    assert store.delete(999) is False


def test_store_path_from_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("RECEIPTS_DB", str(tmp_path / "env" / "r.db"))
    assert ReceiptStore().path == tmp_path / "env" / "r.db"
    assert (tmp_path / "env" / "r.db").is_file()


def test_find_duplicate(tmp_path):
    store = filled_store(tmp_path)
    same = receipt("rewe", "2026-10-03", [item("KAFFEE", 6.99), item("LEERGUT", -0.25, LineType.DEPOSIT_RETURN)])
    assert store.find_duplicate(same) is not None
    assert store.find_duplicate(receipt("REWE", "2026-10-03", [item("KAFFEE", 6.99)])) is None


def test_analytics(tmp_path):
    store = filled_store(tmp_path)
    receipts = an.receipts_frame(store.list_receipts())
    items = an.items_frame(store.all_line_items())

    overview = an.overview(receipts, today=date(2026, 10, 5))
    assert overview == {
        "receipts": 3,
        "total_spent": 11.66,
        "avg_receipt": 3.89,
        "this_month": 10.42,
        "last_month": 1.24,
        "needs_review": 1,
    }

    monthly = an.monthly_totals(receipts)
    assert monthly["month"].tolist() == ["2026-09", "2026-10"]
    assert monthly["total"].round(2).tolist() == [1.24, 10.42]

    stores = an.by_store(receipts)
    assert stores["store"].tolist() == ["REWE", "LIDL"]  # case-insensitive grouping
    assert stores["visits"].tolist() == [1, 2]

    top = an.top_products(items)
    assert top.iloc[0]["product"] == "Kaffee"
    milk = top[top["product"] == "Milch"].iloc[0]
    assert milk["times_bought"] == 2
    assert round(milk["spent"], 2) == 2.38
    assert "Pfand" not in top["product"].tolist()

    assert an.extras(items) == {"discounts_saved": 0.2, "deposit_paid": 0.25, "deposit_returned": 0.25, "deposit_open": 0.0}


def test_analytics_empty(tmp_path):
    store = ReceiptStore(tmp_path / "empty.db")
    receipts = an.receipts_frame(store.list_receipts())
    items = an.items_frame(store.all_line_items())
    assert an.monthly_totals(receipts).empty
    assert an.by_store(receipts).empty
    assert an.top_products(items).empty
    assert an.extras(items)["deposit_open"] == 0.0
