import json
from types import SimpleNamespace

import pytest

from receipt_extractor import ExtractionError, LineType, Receipt, ReceiptExtractor
from receipt_extractor.__main__ import main
from receipt_extractor.extractor import mime_type_for


def receipt_json(total=2.38):
    return {
        "store_name": "ALDI SÜD",
        "store_address": "Musterstraße 1, 80331 München",
        "date": "2026-10-02",
        "time": "09:15",
        "currency": "EUR",
        "line_items": [
            {
                "raw_text": "BUTTER",
                "name": "Butter",
                "line_type": "product",
                "quantity": None,
                "unit": None,
                "unit_price": None,
                "total_price": 2.29,
                "vat_code": "B",
            },
            {
                "raw_text": "PFAND",
                "name": "Pfand",
                "line_type": "deposit",
                "quantity": None,
                "unit": None,
                "unit_price": None,
                "total_price": 0.25,
                "vat_code": "A",
            },
            {
                "raw_text": "RABATT",
                "name": "Rabatt",
                "line_type": "discount",
                "quantity": None,
                "unit": None,
                "unit_price": None,
                "total_price": -0.16,
                "vat_code": "B",
            },
        ],
        "total": total,
        "payment_method": "cash",
        "vat_summary": [],
    }


class FakeModels:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def generate_content(self, *, model, contents, config):
        self.calls.append({"model": model, "contents": contents, "config": config})
        return self.responses.pop(0)


def fake_client(*responses):
    return SimpleNamespace(models=FakeModels(responses))


def parsed(data):
    return SimpleNamespace(parsed=Receipt.model_validate(data), text=json.dumps(data))


def test_extracts_valid_receipt_in_one_call():
    client = fake_client(parsed(receipt_json()))
    result = ReceiptExtractor(client=client, model="test-model").extract(b"img", "image/jpeg")

    assert not result.needs_review
    assert result.attempts == 1
    assert result.receipt.store_name == "ALDI SÜD"
    assert result.receipt.line_items[2].line_type is LineType.DISCOUNT

    call = client.models.calls[0]
    assert call["model"] == "test-model"
    assert call["config"].response_schema is Receipt
    assert call["config"].response_mime_type == "application/json"
    assert call["config"].temperature == 0
    assert call["contents"][0].inline_data.mime_type == "image/jpeg"


def test_falls_back_to_text_when_parsed_is_missing():
    client = fake_client(SimpleNamespace(parsed=None, text=json.dumps(receipt_json())))
    result = ReceiptExtractor(client=client, model="m").extract(b"img", "image/png")
    assert result.receipt.total == 2.38


def test_retries_once_with_issues_then_succeeds():
    client = fake_client(parsed(receipt_json(total=9.99)), parsed(receipt_json()))
    result = ReceiptExtractor(client=client, model="m").extract(b"img", "image/jpeg")

    assert result.validation.ok
    assert result.attempts == 2
    retry_prompt = client.models.calls[1]["contents"][1]
    assert "failed these consistency checks" in retry_prompt
    assert "9.99" in retry_prompt


def test_returns_needs_review_after_all_attempts_fail():
    client = fake_client(parsed(receipt_json(total=9.99)), parsed(receipt_json(total=8.88)))
    result = ReceiptExtractor(client=client, model="m").extract(b"img", "image/jpeg")

    assert result.needs_review
    assert result.attempts == 2
    assert len(client.models.calls) == 2


def test_invalid_json_raises():
    client = fake_client(SimpleNamespace(parsed=None, text='{"store_name": "LIDL"}'))
    with pytest.raises(ExtractionError, match="does not match"):
        ReceiptExtractor(client=client, model="m").extract(b"img", "image/jpeg")


def test_empty_response_raises():
    client = fake_client(SimpleNamespace(parsed=None, text=None))
    with pytest.raises(ExtractionError, match="empty response"):
        ReceiptExtractor(client=client, model="m").extract(b"img", "image/jpeg")


def test_empty_image_raises():
    with pytest.raises(ExtractionError, match="empty"):
        ReceiptExtractor(client=fake_client(), model="m").extract(b"", "image/jpeg")


def test_model_from_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-env-model")
    assert ReceiptExtractor(client=fake_client()).model == "gemini-env-model"


def test_mime_type_detection(tmp_path):
    assert mime_type_for(tmp_path / "bon.JPG") == "image/jpeg"
    assert mime_type_for(tmp_path / "bon.pdf") == "application/pdf"
    with pytest.raises(ExtractionError, match="Unsupported"):
        mime_type_for(tmp_path / "bon.txt")


def test_cli_writes_json_and_exit_code(tmp_path, capsys):
    image = tmp_path / "bon.jpg"
    image.write_bytes(b"img")
    out = tmp_path / "bon.json"

    extractor = ReceiptExtractor(client=fake_client(parsed(receipt_json())), model="m")
    assert main([str(image), "--out", str(out)], extractor=extractor) == 0
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["receipt"]["store_name"] == "ALDI SÜD"
    assert data["validation"] == {"ok": True, "issues": []}


def test_cli_needs_review_exit_code(tmp_path, capsys):
    image = tmp_path / "bon.jpg"
    image.write_bytes(b"img")
    client = fake_client(parsed(receipt_json(total=9.99)), parsed(receipt_json(total=9.99)))
    assert main([str(image)], extractor=ReceiptExtractor(client=client, model="m")) == 2
    assert "needs review" in capsys.readouterr().err


def test_cli_missing_file(tmp_path, capsys):
    assert main([str(tmp_path / "nope.jpg")], extractor=ReceiptExtractor(client=fake_client(), model="m")) == 1


def test_api_error_becomes_extraction_error():
    from google.genai import errors

    class FailingModels:
        def generate_content(self, **kwargs):
            raise errors.ClientError(400, {"error": {"code": 400, "message": "API key not valid.", "status": "INVALID_ARGUMENT"}})

    client = SimpleNamespace(models=FailingModels())
    with pytest.raises(ExtractionError, match="API key not valid"):
        ReceiptExtractor(client=client, model="m").extract(b"img", "image/jpeg")
