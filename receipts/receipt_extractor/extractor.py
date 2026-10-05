"""Receipt image -> structured Receipt, using a single Gemini vision call (plus one retry on failed checks)."""

import os
from dataclasses import dataclass
from pathlib import Path

from .prompt import EXTRACTION_PROMPT, RETRY_NOTE
from .schema import Receipt
from .validation import ValidationResult, validate_receipt

DEFAULT_MODEL = "gemini-2.5-flash"

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
    def __init__(self, client=None, model: str | None = None, max_attempts: int = 2):
        if client is None:
            from google import genai

            # Reads GEMINI_API_KEY (or GOOGLE_API_KEY) from the environment.
            client = genai.Client()
        self.client = client
        self.model = model or os.environ.get("GEMINI_MODEL") or DEFAULT_MODEL
        self.max_attempts = max_attempts

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
            receipt = self._call_model(data, mime_type, prompt)
            validation = validate_receipt(receipt)
            result = ExtractionResult(receipt=receipt, validation=validation, model=self.model, attempts=attempt)
            if validation.ok:
                return result
            if best is None or len(validation.issues) < len(best.validation.issues):
                best = result
            prompt = EXTRACTION_PROMPT + RETRY_NOTE.format(issues="\n".join(f"- {issue}" for issue in validation.issues))

        best.attempts = self.max_attempts
        return best

    def _call_model(self, data: bytes, mime_type: str, prompt: str) -> Receipt:
        from google.genai import errors, types

        try:
            response = self.client.models.generate_content(
                model=self.model,
                contents=[types.Part.from_bytes(data=data, mime_type=mime_type), prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=Receipt,
                    temperature=0,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
                ),
            )
        except errors.APIError as exc:
            raise ExtractionError(f"Gemini API error {exc.code}: {exc.message}") from exc
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
