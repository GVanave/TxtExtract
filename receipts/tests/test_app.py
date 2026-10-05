"""UI tests: run the real Streamlit app headless with a fake extractor (no API key, no network)."""

from datetime import date
from pathlib import Path
from types import SimpleNamespace

import pytest
import streamlit as st
from streamlit.testing.v1 import AppTest

from receipt_extractor import LineItem, LineType, Receipt, ReceiptExtractor
from receipt_extractor import app_support as support
from receipt_extractor.store import ReceiptStore

APP = str(Path(__file__).parents[1] / "app.py")


def item(text, total, line_type=LineType.PRODUCT, **kw):
    return LineItem(
        raw_text=text,
        name=text.title(),
        line_type=line_type,
        quantity=kw.get("quantity"),
        unit=kw.get("unit"),
        unit_price=kw.get("unit_price"),
        total_price=total,
        vat_code="B",
    )


GOOD = Receipt(
    store_name="LIDL",
    store_address="Hauptstraße 5, 10115 Berlin",
    date="2026-10-02",
    time="18:42",
    currency="EUR",
    line_items=[
        item("BIO VOLLM. 3,8%", 1.19),
        item("BANANEN", 1.44, quantity=0.482, unit="kg", unit_price=2.99),
        item("PFAND 0,25", 0.25, LineType.DEPOSIT),
        item("RABATT", -0.30, LineType.DISCOUNT),
    ],
    total=2.58,
    payment_method="girocard",
    vat_summary=[],
)


class FakeModels:
    def __init__(self, receipts):
        self.receipts = list(receipts)

    def generate_content(self, **kwargs):
        return SimpleNamespace(parsed=self.receipts.pop(0), text=None)


@pytest.fixture
def app(tmp_path, monkeypatch):
    monkeypatch.setenv("RECEIPTS_DB", str(tmp_path / "app.db"))
    monkeypatch.setenv("GEMINI_API_KEY", "test")
    st.cache_resource.clear()

    def use(*receipts):
        client = SimpleNamespace(models=FakeModels(receipts))
        monkeypatch.setattr(support, "build_extractor", lambda model: ReceiptExtractor(client=client, model="fake-model"))

    yield use
    st.cache_resource.clear()


def run(page=None):
    """Run the whole app, or just one page function (AppTest can't switch between function-based pages)."""
    if page is None:
        return AppTest.from_file(APP, default_timeout=30).run()
    script = f"import runpy\nrunpy.run_path({APP!r}, run_name='kassenbon')[{page!r}]()\n"
    return AppTest.from_string(script, default_timeout=30).run()


def test_scan_page_renders_without_errors(app):
    app()
    at = run()
    assert not at.exception
    assert at.title[0].value == "Scan a receipt"


def test_review_valid_receipt_and_save(app, tmp_path):
    app()
    at = AppTest.from_file(APP, default_timeout=30)
    at.session_state["draft"] = {
        "id": 1,
        "receipt": GOOD,
        "model": "fake-model",
        "attempts": 1,
        "image": b"not-an-image",
        "mime_type": "application/pdf",
        "name": "bon.pdf",
    }
    at.run()
    assert not at.exception
    assert at.success[0].value.startswith("All checks passed")
    assert at.text_input(key="draft1_store").value == "LIDL"

    save = next(b for b in at.button if b.label == "Save receipt")
    save.click().run()
    assert not at.exception
    assert "draft" not in at.session_state

    saved = ReceiptStore(tmp_path / "app.db").list_receipts()
    assert len(saved) == 1
    assert saved[0]["total"] == 2.58
    assert saved[0]["needs_review"] is False


def test_editing_total_shows_warning_and_saves_for_review(app, tmp_path):
    app()
    at = AppTest.from_file(APP, default_timeout=30)
    at.session_state["draft"] = {
        "id": 1,
        "receipt": GOOD,
        "model": "fake-model",
        "attempts": 1,
        "image": b"x",
        "mime_type": "application/pdf",
        "name": "bon.pdf",
    }
    at.run()
    at.number_input(key="draft1_total").set_value(9.99).run()
    assert not at.exception
    assert "Some checks failed" in at.warning[0].value

    save = next(b for b in at.button if b.label == "Save for review")
    save.click().run()
    saved = ReceiptStore(tmp_path / "app.db").list_receipts()
    assert saved[0]["needs_review"] is True
    assert "9.99" in saved[0]["issues"][0]


def test_extract_function_creates_draft(app):
    app(GOOD)
    at = AppTest.from_string(
        f"""
import runpy, streamlit as st
mod = runpy.run_path({APP!r}, run_name="kassenbon")
if "draft" not in st.session_state:
    mod["extract"](b"img", "image/png", "bon.png")
""",
        default_timeout=30,
    )
    at.run()
    assert not at.exception
    assert at.session_state["draft"]["receipt"].store_name == "LIDL"
    assert at.session_state["draft"]["model"] == "fake-model"


def test_receipts_and_dashboard_pages(app, tmp_path):
    app()
    store = ReceiptStore(tmp_path / "app.db")
    store.save(GOOD, issues=[], model="m", image_name="bon.jpg")
    store.save(GOOD.model_copy(update={"store_name": "REWE", "date": "2026-09-20"}), issues=["check"], model="m")

    at = run("receipts_page")
    assert not at.exception
    assert at.title[0].value == "Receipts"
    assert len(at.dataframe[0].value) == 2

    at = run("dashboard_page")
    assert not at.exception
    labels = [m.label for m in at.metric]
    assert {"This month", "All time", "Receipts", "Average receipt"} <= set(labels)
    assert next(m for m in at.metric if m.label == "Receipts").value == "2"


def test_empty_pages(app):
    app()
    for page, text in (("receipts_page", "No receipts yet"), ("dashboard_page", "dashboard fills in")):
        at = run(page)
        assert not at.exception
        assert text in at.info[0].value


def test_rows_to_receipt_roundtrip_and_problems():
    rows = support.items_to_rows(GOOD)
    rebuilt, problems = support.rows_to_receipt(
        rows + [{key: None for key in support.ITEM_COLUMNS}],  # empty editor row is ignored
        store_name=" LIDL ",
        purchase_date=date(2026, 10, 2),
        time="18:42",
        total=2.58,
        payment_method="",
        base=GOOD,
    )
    assert problems == []
    assert rebuilt.line_items == GOOD.line_items
    assert rebuilt.store_name == "LIDL"
    assert rebuilt.payment_method is None

    rows[0]["total_price"] = float("nan")
    _, problems = support.rows_to_receipt(
        rows, store_name="", purchase_date=None, time=None, total=1, payment_method=None, base=GOOD
    )
    assert problems == ["Row 1: the line total is empty.", "The store name is empty."]


def test_euro_formatting():
    assert support.euro(1234.5) == "1.234,50 €"
    assert support.euro(-0.3) == "-0,30 €"
    assert support.euro(None) == "–"
