import json
from types import SimpleNamespace

from receipt_extractor import LineItem, LineType, Receipt, ReceiptExtractor
from receipt_extractor.eval import main
from receipt_extractor.evaluation import match_items, score_receipt, summarize


def item(text, total, line_type=LineType.PRODUCT, quantity=None, unit_price=None, vat_code="B"):
    return LineItem(
        raw_text=text,
        name=text.title(),
        line_type=line_type,
        quantity=quantity,
        unit="kg" if quantity and quantity < 1 else None,
        unit_price=unit_price,
        total_price=total,
        vat_code=vat_code,
    )


def receipt(items, total=None, **overrides):
    data = {
        "store_name": "LIDL",
        "store_address": None,
        "date": "2026-09-28",
        "time": "18:42",
        "currency": "EUR",
        "line_items": list(items),
        "total": total if total is not None else round(sum(i.total_price for i in items), 2),
        "payment_method": "girocard",
        "vat_summary": [],
    }
    data.update(overrides)
    return Receipt(**data)


EXPECTED_ITEMS = [
    item("BIO VOLLM. 3,8%", 1.19),
    item("BANANEN", 1.44, quantity=0.482, unit_price=2.99),
    item("PFAND 0,25", 0.25, line_type=LineType.DEPOSIT, vat_code="A"),
    item("RABATT", -0.30, line_type=LineType.DISCOUNT),
]


def test_identical_receipt_is_fully_correct():
    expected = receipt(EXPECTED_ITEMS)
    score = score_receipt("lidl", expected, expected)
    assert score.fully_correct
    assert score.item_f1 == 1.0
    assert score.name_similarity == 1.0


def test_missing_and_extra_lines_are_reported():
    predicted_items = [EXPECTED_ITEMS[0], EXPECTED_ITEMS[2], EXPECTED_ITEMS[3], item("KAUGUMMI", 0.99)]
    score = score_receipt("lidl", receipt(EXPECTED_ITEMS), receipt(predicted_items))

    assert not score.fully_correct
    assert score.matched_items == 3
    assert score.missing_items == ["BANANEN 1.44"]
    assert score.extra_items == ["KAUGUMMI 0.99"]
    assert score.item_precision == 0.75
    assert score.item_recall == 0.75
    assert score.header["total"] is False


def test_wrong_item_fields_are_counted():
    predicted_items = list(EXPECTED_ITEMS)
    predicted_items[2] = item("PFAND 0,25", 0.25, line_type=LineType.PRODUCT, vat_code="A")
    predicted_items[1] = item("BANANEN", 1.44, quantity=None, unit_price=None)
    score = score_receipt("lidl", receipt(EXPECTED_ITEMS), receipt(predicted_items))

    assert score.item_f1 == 1.0
    assert score.item_field_correct["line_type"] == 3
    assert score.item_field_correct["quantity"] == 3
    assert score.item_field_correct["unit_price"] == 3
    assert not score.fully_correct


def test_matching_prefers_similar_text_for_equal_prices():
    expected = [item("APFEL", 0.99), item("BIRNE", 0.99)]
    predicted = [item("BIRNE", 0.99), item("APFEL", 0.99)]
    assert match_items(expected, predicted) == [(0, 1), (1, 0)]


def test_header_fields_and_optional_values():
    expected = receipt(EXPECTED_ITEMS, time=None, payment_method=None, store_name="LIDL")
    predicted = receipt(EXPECTED_ITEMS, time="10:00", payment_method="cash", store_name="Lidl", date="2026-09-29")
    score = score_receipt("lidl", expected, predicted)
    assert score.header == {
        "store_name": True,
        "date": False,
        "time": True,
        "total": True,
        "payment_method": True,
        "item_count": True,
    }


def test_summary_counts_wrong_but_not_flagged():
    good = score_receipt("a", receipt(EXPECTED_ITEMS), receipt(EXPECTED_ITEMS), seconds=2.0)
    wrong = score_receipt("b", receipt(EXPECTED_ITEMS), receipt(EXPECTED_ITEMS[:3]), flagged_for_review=False, seconds=4.0)
    flagged = score_receipt("c", receipt(EXPECTED_ITEMS), receipt(EXPECTED_ITEMS[:2]), flagged_for_review=True, attempts=2)

    summary = summarize([good, wrong, flagged], errors=1)
    assert summary["receipts"] == 3
    assert summary["errors"] == 1
    assert summary["fully_correct_rate"] == 1 / 3
    assert summary["items"]["expected"] == 12
    assert summary["items"]["matched"] == 9
    assert summary["items"]["precision"] == 1.0
    assert summary["items"]["recall"] == 0.75
    assert summary["review_flag"] == {"flagged": 1, "wrong": 2, "wrong_and_not_flagged": 1, "flagged_but_correct": 0}
    assert summary["retried"] == 1
    assert summary["avg_seconds"] == 3.0


def test_empty_summary():
    assert summarize([]) == {"receipts": 0, "errors": 0}


# --- runner -----------------------------------------------------------------------------------------


class FakeModels:
    def __init__(self, receipts):
        self.receipts = list(receipts)

    def generate_content(self, **kwargs):
        return SimpleNamespace(parsed=self.receipts.pop(0), text=None)


def make_samples(tmp_path, names):
    samples = tmp_path / "samples"
    samples.mkdir()
    for name in names:
        (samples / f"{name}.jpg").write_bytes(b"img")
    return samples


def test_runner_scores_saves_predictions_and_report(tmp_path, capsys):
    samples = make_samples(tmp_path, ["a_lidl", "b_aldi"])
    (samples / "a_lidl.expected.json").write_text(receipt(EXPECTED_ITEMS).model_dump_json(), encoding="utf-8")
    (samples / "b_aldi.expected.json").write_text(receipt(EXPECTED_ITEMS).model_dump_json(), encoding="utf-8")

    wrong = receipt(EXPECTED_ITEMS[:3], total=receipt(EXPECTED_ITEMS).total)  # missing discount, fails validation twice
    client = SimpleNamespace(models=FakeModels([receipt(EXPECTED_ITEMS), wrong, wrong]))
    extractor = ReceiptExtractor(client=client, model="gemini-test")

    out_dir = tmp_path / "runs"
    assert main([str(samples), "--out-dir", str(out_dir)], extractor=extractor) == 0

    [run_dir] = list(out_dir.iterdir())
    assert "gemini-test" in run_dir.name
    assert (run_dir / "a_lidl.json").is_file()
    report = json.loads((run_dir / "report.json").read_text(encoding="utf-8"))
    assert report["model"] == "gemini-test"
    assert report["summary"]["receipts"] == 2
    assert report["summary"]["fully_correct_rate"] == 0.5
    assert report["summary"]["review_flag"]["flagged"] == 1
    out = capsys.readouterr().out
    assert "OK    a_lidl" in out
    assert "WRONG b_aldi" in out
    assert "missing: RABATT -0.30" in out

    # Re-scoring the saved run needs no API calls.
    assert main([str(samples), "--predictions", str(run_dir)], extractor=None) == 0
    rescored = json.loads((run_dir / "report.json").read_text(encoding="utf-8"))
    assert rescored["summary"] == report["summary"]


def test_runner_drafts_missing_ground_truth(tmp_path, capsys):
    samples = make_samples(tmp_path, ["new_receipt"])
    client = SimpleNamespace(models=FakeModels([receipt(EXPECTED_ITEMS)]))
    extractor = ReceiptExtractor(client=client, model="m")

    assert main([str(samples), "--out-dir", str(tmp_path / "runs"), "--draft-missing"], extractor=extractor) == 0
    draft = Receipt.model_validate_json((samples / "new_receipt.expected.json").read_text(encoding="utf-8"))
    assert draft.total == receipt(EXPECTED_ITEMS).total
    assert "DRAFT new_receipt.expected.json" in capsys.readouterr().out


def test_runner_skips_samples_without_ground_truth(tmp_path, capsys):
    samples = make_samples(tmp_path, ["unlabelled"])
    client = SimpleNamespace(models=FakeModels([receipt(EXPECTED_ITEMS)]))
    assert main([str(samples), "--out-dir", str(tmp_path / "runs")], extractor=ReceiptExtractor(client=client, model="m")) == 0
    assert "SKIP  unlabelled: no unlabelled.expected.json" in capsys.readouterr().out
    assert not (samples / "unlabelled.expected.json").exists()


def test_runner_errors_on_empty_folder(tmp_path):
    (tmp_path / "empty").mkdir()
    assert main([str(tmp_path / "empty")], extractor=ReceiptExtractor(client=object(), model="m")) == 1
