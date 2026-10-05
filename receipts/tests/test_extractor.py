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


def test_missing_api_key_raises_clear_error(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    with pytest.raises(ExtractionError, match="No Gemini API key"):
        ReceiptExtractor()


def test_api_key_argument_is_passed_to_client(monkeypatch):
    from google import genai

    seen = {}
    monkeypatch.setattr(genai, "Client", lambda api_key: seen.setdefault("api_key", api_key))
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    ReceiptExtractor(api_key="abc")
    assert seen["api_key"] == "abc"


def test_load_env_reads_dotenv_without_overriding_shell(tmp_path, monkeypatch):
    from receipt_extractor import settings

    (tmp_path / ".env").write_text("GEMINI_API_KEY=from-file\nGEMINI_MODEL=file-model\n", encoding="utf-8")
    monkeypatch.setattr(settings, "PACKAGE_ROOT", tmp_path)
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("GEMINI_MODEL", "shell-model")

    assert settings.load_env() == [tmp_path / ".env"]
    assert settings.env_api_key() == "from-file"
    import os

    assert os.environ["GEMINI_MODEL"] == "shell-model"
    monkeypatch.delenv("GEMINI_API_KEY")  # load_dotenv set it outside monkeypatch


# --- Google-side errors: retry with backoff, then fallback models ------------------------------------------


def api_error(code, message="This model is currently experiencing high demand."):
    from google.genai import errors

    cls = errors.ClientError if code < 500 else errors.ServerError
    return cls(code, {"error": {"code": code, "message": message, "status": "UNAVAILABLE"}})


class ScriptedModels:
    """Raises or returns per call, recording which model was asked."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.models = []

    def generate_content(self, *, model, contents, config):
        self.models.append(model)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def scripted_extractor(outcomes, **kwargs):
    models = ScriptedModels(outcomes)
    sleeps, retries = [], []
    extractor = ReceiptExtractor(
        client=SimpleNamespace(models=models),
        model="main-model",
        sleep=sleeps.append,
        on_retry=lambda *args: retries.append(args),
        **kwargs,
    )
    return extractor, models, sleeps, retries


def test_retries_503_then_succeeds(monkeypatch):
    monkeypatch.delenv("GEMINI_FALLBACK_MODEL", raising=False)
    extractor, models, sleeps, retries = scripted_extractor([api_error(503), api_error(503), parsed(receipt_json())])
    result = extractor.extract(b"img", "image/jpeg")

    assert result.receipt.store_name == "ALDI SÜD"
    assert result.model == "main-model"
    assert sleeps == [2, 5]
    assert retries == [("main-model", 1, 2, 503), ("main-model", 2, 5, 503)]


def test_falls_back_to_second_model_when_main_stays_busy():
    outcomes = [api_error(503)] * 4 + [parsed(receipt_json())]
    extractor, models, sleeps, _ = scripted_extractor(outcomes, fallback_models=["backup-model"])
    result = extractor.extract(b"img", "image/jpeg")

    assert models.models == ["main-model"] * 4 + ["backup-model"]
    assert result.model == "backup-model"
    assert sleeps == [2, 5, 10]


def test_gives_clear_error_when_everything_is_busy():
    outcomes = [api_error(503)] * 4 + [api_error(429, "Quota exceeded")] * 4
    extractor, models, _, _ = scripted_extractor(outcomes, fallback_models=["backup-model"])
    with pytest.raises(ExtractionError, match="busy or rate-limited") as exc:
        extractor.extract(b"img", "image/jpeg")
    assert "main-model: 503 after 4 tries" in str(exc.value)
    assert "backup-model: 429 after 4 tries" in str(exc.value)
    assert len(models.models) == 8


def test_error_suggests_fallback_when_none_configured(monkeypatch):
    monkeypatch.delenv("GEMINI_FALLBACK_MODEL", raising=False)
    extractor, _, _, _ = scripted_extractor([api_error(503)] * 4)
    with pytest.raises(ExtractionError, match="set GEMINI_FALLBACK_MODEL"):
        extractor.extract(b"img", "image/jpeg")


def test_permanent_errors_are_not_retried():
    extractor, models, sleeps, _ = scripted_extractor([api_error(403, "API key not valid")], fallback_models=["backup"])
    with pytest.raises(ExtractionError, match="403 \\(main-model\\): API key not valid"):
        extractor.extract(b"img", "image/jpeg")
    assert sleeps == []
    assert models.models == ["main-model"]


def test_retired_model_moves_on_to_fallback_without_retrying():
    retired = api_error(404, "This model models/main-model is no longer available to new users.")
    extractor, models, sleeps, _ = scripted_extractor([retired, parsed(receipt_json())], fallback_models=["backup"])
    result = extractor.extract(b"img", "image/jpeg")
    assert models.models == ["main-model", "backup"]
    assert result.model == "backup"
    assert sleeps == []


def test_busy_main_and_retired_fallback_reports_both():
    outcomes = [api_error(503)] * 4 + [api_error(404, "no longer available to new users")]
    extractor, _, _, _ = scripted_extractor(outcomes, fallback_models=["old-lite"])
    with pytest.raises(ExtractionError) as exc:
        extractor.extract(b"img", "image/jpeg")
    message = str(exc.value)
    assert "main-model: 503 after 4 tries" in message
    assert "old-lite: not available (404). no longer available to new users" in message


def test_only_retired_models_asks_to_change_model_name():
    extractor, _, _, _ = scripted_extractor([api_error(404, "gone")], fallback_models=[])
    with pytest.raises(ExtractionError, match="No usable Gemini model.*Change the model name"):
        extractor.extract(b"img", "image/jpeg")


def test_fallback_models_from_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_FALLBACK_MODEL", "a-model, b-model, main-model")
    extractor, _, _, _ = scripted_extractor([])
    assert extractor.fallback_models == ["a-model", "b-model"]
