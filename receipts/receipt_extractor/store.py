"""SQLite storage for saved receipts. One file, no server; path from $RECEIPTS_DB or data/receipts.db."""

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime
from pathlib import Path

from .schema import Receipt

DEFAULT_DB = Path("data/receipts.db")

SCHEMA = """
CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_name TEXT NOT NULL,
    date TEXT,
    time TEXT,
    total REAL NOT NULL,
    currency TEXT NOT NULL,
    payment_method TEXT,
    needs_review INTEGER NOT NULL,
    issues TEXT NOT NULL,
    model TEXT,
    image_name TEXT,
    created_at TEXT NOT NULL,
    receipt_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    raw_text TEXT NOT NULL,
    name TEXT NOT NULL,
    line_type TEXT NOT NULL,
    quantity REAL,
    unit TEXT,
    unit_price REAL,
    total_price REAL NOT NULL,
    vat_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_line_items_receipt ON line_items(receipt_id);
"""

RECEIPT_COLUMNS = (
    "id, store_name, date, time, total, currency, payment_method, needs_review, issues, model, image_name, created_at"
)


class ReceiptStore:
    def __init__(self, path: str | Path | None = None):
        self.path = Path(path or os.environ.get("RECEIPTS_DB") or DEFAULT_DB)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as conn:
            conn.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def save(
        self,
        receipt: Receipt,
        issues: list[str],
        model: str | None = None,
        image_name: str | None = None,
    ) -> int:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                "INSERT INTO receipts (store_name, date, time, total, currency, payment_method, needs_review, issues,"
                " model, image_name, created_at, receipt_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    receipt.store_name,
                    receipt.date,
                    receipt.time,
                    receipt.total,
                    receipt.currency,
                    receipt.payment_method,
                    int(bool(issues)),
                    json.dumps(issues, ensure_ascii=False),
                    model,
                    image_name,
                    datetime.now().isoformat(timespec="seconds"),
                    receipt.model_dump_json(),
                ),
            )
            receipt_id = cursor.lastrowid
            conn.executemany(
                "INSERT INTO line_items (receipt_id, position, raw_text, name, line_type, quantity, unit, unit_price,"
                " total_price, vat_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        receipt_id,
                        position,
                        item.raw_text,
                        item.name,
                        item.line_type.value,
                        item.quantity,
                        item.unit,
                        item.unit_price,
                        item.total_price,
                        item.vat_code,
                    )
                    for position, item in enumerate(receipt.line_items)
                ],
            )
        return receipt_id

    def list_receipts(self) -> list[dict]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                f"SELECT {RECEIPT_COLUMNS} FROM receipts ORDER BY COALESCE(date, substr(created_at, 1, 10)) DESC, time DESC, id DESC"  # noqa: S608
            ).fetchall()
        return [self._row(row) for row in rows]

    def get(self, receipt_id: int) -> tuple[dict, Receipt] | None:
        with closing(self._connect()) as conn:
            row = conn.execute(f"SELECT {RECEIPT_COLUMNS}, receipt_json FROM receipts WHERE id = ?", (receipt_id,)).fetchone()  # noqa: S608
        if row is None:
            return None
        return self._row(row), Receipt.model_validate_json(row["receipt_json"])

    def all_line_items(self) -> list[dict]:
        """Every saved line with its receipt's store and date, for analytics."""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT li.receipt_id, li.position, li.raw_text, li.name, li.line_type, li.quantity, li.unit,"
                " li.unit_price, li.total_price, li.vat_code, r.store_name, COALESCE(r.date, substr(r.created_at, 1, 10)) AS date"
                " FROM line_items li JOIN receipts r ON r.id = li.receipt_id ORDER BY li.receipt_id, li.position"
            ).fetchall()
        return [dict(row) for row in rows]

    def find_duplicate(self, receipt: Receipt) -> int | None:
        """A saved receipt from the same store, date, time and total, if any."""
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT id FROM receipts WHERE lower(store_name) = lower(?) AND date IS ? AND time IS ? AND round(total, 2) = round(?, 2)",
                (receipt.store_name, receipt.date, receipt.time, receipt.total),
            ).fetchone()
        return row["id"] if row else None

    def delete(self, receipt_id: int) -> bool:
        with closing(self._connect()) as conn, conn:
            return conn.execute("DELETE FROM receipts WHERE id = ?", (receipt_id,)).rowcount > 0

    @staticmethod
    def _row(row: sqlite3.Row) -> dict:
        data = {key: row[key] for key in row.keys() if key != "receipt_json"}
        data["needs_review"] = bool(data["needs_review"])
        data["issues"] = json.loads(data["issues"])
        return data
