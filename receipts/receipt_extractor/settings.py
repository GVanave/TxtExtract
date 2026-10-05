"""Configuration from the environment, with optional .env files."""

import os
from pathlib import Path

from dotenv import load_dotenv

PACKAGE_ROOT = Path(__file__).resolve().parents[1]  # the receipts/ folder


def load_env() -> list[Path]:
    """Load receipts/.env and a .env in the current folder, if present.

    Variables already set in the shell win, so `export GEMINI_API_KEY=...` still overrides the file.
    """
    loaded = []
    for path in dict.fromkeys((PACKAGE_ROOT / ".env", Path.cwd() / ".env")):
        if path.is_file():
            load_dotenv(path, override=False)
            loaded.append(path)
    return loaded


def env_api_key() -> str | None:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or None
