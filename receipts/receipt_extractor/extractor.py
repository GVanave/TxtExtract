"""Receipt image -> structured Receipt, using a single Gemini vision call (plus one retry on failed checks)."""

import os
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from .prompt import EXTRACTION_PROMPT, RETRY_NOTE
from .schema import Receipt
from .settings import env_api_key
from .validation import ValidationResult, validate_receipt

DEFAULT_MODEL = "gemini-2.5-flash"

# Errors worth retrying: rate limit, and Google-side overload/outage ("model is experiencing high demand").
TRANSIENT_CODES = {429, 500, 502, 503, 504}
RETRY_DELAYS = (2, 5, 10)  # seconds between attempts on the same model

MIME_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".pdf": "application/pdf",
}


class ExtractionError(Exception):
    pass


@dataclass
class ExtractionResult:
    receipt: Receipt
    validation: ValidationResult
    model: str
    attempts: int

    @property
    def needs_review(self) -> bool:
        return not self.validation.ok

    def to_dict(self) -> dict:
        return {
            "receipt": self.receipt.model_dump(mode="json"),
            "validation": {"ok": self.validation.ok, "issues": self.validation.issues},
            "model": self.model,
            "attempts": self.attempts,
        }


def mime_type_for(path: Path) -> str:
    try:
        return MIME_TYPES[path.suffix.lower()]
    except KeyError:
        raise ExtractionError(f"Unsupported file type '{path.suffix}'. Use one of: {', '.join(sorted(MIME_TYPES))}.") from None


class ReceiptExtractor:
    def __init__(
        self,
        client=None,
        model: str | None = None,
        max_attempts: int = 2,
        api_key: str | None = None,
        fallback_models: list[str] | None = None,
        retry_delays: tuple[float, ...] = RETRY_DELAYS,
        on_retry: Callable[[str, int, float, int], None] | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ):
        if client is None:
            from google import genai

            api_key = api_key or env_api_key()
            if not api_key:
                raise ExtractionError("No Gemini API key. Set GEMINI_API_KEY in your environment or .env file.")
            client = genai.Client(api_key=api_key)
        self.client = client
        self.model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL
        self.max_attempts = max_attempts
        if fallback_models is None:
            fallback_models = [m.strip() for m in os.environ.get("GEMINI_FALLBACK_MODEL", "").split(",") if m.strip()]
        self.fallback_models = [m for m in fallback_models if m != self.model]
        self.retry_delays = retry_delays
        self.on_retry = on_retry  # called as on_retry(model, attempt, delay_seconds, error_code) before each wait
        self.sleep = sleep

    def extract_file(self, path: str | Path) -> ExtractionResult:
        path = Path(path)
        mime_type = mime_type_for(path)
        return self.extract(path.read_bytes(), mime_type)

    def extract(self, data: bytes, mime_type: str) -> ExtractionResult:
        if not data:
            raise ExtractionError("The image is empty.")

        best: ExtractionResult | None = None
        prompt = EXTRACTION_PROMPT
        for attempt in range(1, self.max_attempts + 1):
            receipt, used_model = self._call_model(data, mime_type, prompt)
            validation = validate_receipt(receipt)
            result = ExtractionResult(receipt=receipt, validation=validation, model=used_model, attempts=attempt)
            if validation.ok:
                return result
            if best is None or len(validation.issues) < len(best.validation.issues):
                best = result
            prompt = EXTRACTION_PROMPT + RETRY_NOTE.format(issues="\n".join(f"- {issue}" for issue in validation.issues))

        best.attempts = self.max_attempts
        return best

    def _call_model(self, data: bytes, mime_type: str, prompt: str) -> tuple[Receipt, str]:
        """One reading of the receipt. Retries Google-side errors, then tries the fallback models in order."""
        from google.genai import errors

        failures = []
        for model in [self.model, *self.fallback_models]:
            for attempt in range(1, len(self.retry_delays) + 2):
                try:
                    return self._parse(self._generate(model, data, mime_type, prompt)), model
                except errors.APIError as exc:
                    if exc.code not in TRANSIENT_CODES:
                        raise ExtractionError(f"Gemini API error {exc.code} ({model}): {exc.message}") from exc
                    if attempt > len(self.retry_delays):
                        failures.append(f"{model}: {exc.code} after {attempt} tries")
                        break
                    delay = self.retry_delays[attempt - 1]
                    if self.on_retry:
                        self.on_retry(model, attempt, delay, exc.code)
                    self.sleep(delay)

        hint = (
            "Try again in a minute, choose another Gemini model"
            + ("" if self.fallback_models else ", or set GEMINI_FALLBACK_MODEL so a second model is tried automatically")
            + "."
        )
        raise ExtractionError(f"Gemini is busy or rate-limited ({'; '.join(failures)}). {hint}")

    def _generate(self, model: str, data: bytes, mime_type: str, prompt: str):
        from google.genai import types

        return self.client.models.generate_content(
            model=model,
            contents=[types.Part.from_bytes(data=data, mime_type=mime_type), prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=Receipt,
                temperature=0,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            ),
        )

    @staticmethod
    def _parse(response) -> Receipt:
        parsed = getattr(response, "parsed", None)
        if isinstance(parsed, Receipt):
            return parsed
        text = getattr(response, "text", None)
        if not text:
            raise ExtractionError("Gemini returned an empty response.")
        try:
            return Receipt.model_validate_json(text)
        except ValueError as exc:
            raise ExtractionError(f"Gemini returned JSON that does not match the receipt schema: {exc}") from exc
