import "server-only";

import ExcelJS from "exceljs";

import { categoryName } from "./categories";
import { LINE_TYPE_LABELS, type SavedReceipt } from "./receipt";

const EURO = '#,##0.00 "€";-#,##0.00 "€"';

/** An Excel file with an "Einkäufe" sheet (one row per receipt) and a "Produkte" sheet (one row per line). */
export async function receiptsWorkbook(receipts: SavedReceipt[]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "Kassenbon";
  book.created = new Date();

  const sheet = book.addWorksheet("Einkäufe", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Datum", key: "date", width: 12, style: { numFmt: "dd.mm.yyyy" } },
    { header: "Uhrzeit", key: "time", width: 8 },
    { header: "Geschäft", key: "store", width: 16 },
    { header: "Name auf dem Kassenbon", key: "storeRaw", width: 30 },
    { header: "Betrag", key: "total", width: 11, style: { numFmt: EURO } },
    { header: "Zeilen", key: "items", width: 8 },
    { header: "Zahlung", key: "payment", width: 12 },
    { header: "Bitte prüfen", key: "review", width: 12 },
    { header: "Hinweise", key: "issues", width: 40 },
    { header: "Einkauf-ID", key: "id", width: 38 },
  ];
  for (const r of receipts) {
    sheet.addRow({
      date: asDate(r.date),
      time: r.time ?? "",
      store: r.store_name,
      storeRaw: r.store_raw,
      total: r.total,
      items: r.line_items.length,
      payment: r.payment_method ?? "",
      review: r.needs_review ? "ja" : "",
      issues: r.issues.join(" | "),
      id: r.id,
    });
  }

  const items = book.addWorksheet("Produkte", { views: [{ state: "frozen", ySplit: 1 }] });
  items.columns = [
    { header: "Datum", key: "date", width: 12, style: { numFmt: "dd.mm.yyyy" } },
    { header: "Geschäft", key: "store", width: 16 },
    { header: "Zeile", key: "line", width: 6 },
    { header: "Text auf dem Kassenbon", key: "raw", width: 26 },
    { header: "Produkt", key: "name", width: 26 },
    { header: "Art", key: "type", width: 10 },
    { header: "Kategorie", key: "category", width: 22 },
    { header: "Menge", key: "qty", width: 9 },
    { header: "Einheit", key: "unit", width: 6 },
    { header: "Stückpreis", key: "unitPrice", width: 11, style: { numFmt: EURO } },
    { header: "Betrag", key: "total", width: 11, style: { numFmt: EURO } },
    { header: "MwSt", key: "vat", width: 5 },
    { header: "Einkauf-ID", key: "id", width: 38 },
  ];
  for (const r of receipts) {
    r.line_items.forEach((item, index) => {
      items.addRow({
        date: asDate(r.date),
        store: r.store_name,
        line: index + 1,
        raw: item.raw_text,
        name: item.name,
        type: LINE_TYPE_LABELS[item.line_type],
        category: item.line_type === "product" || item.line_type === "discount" ? categoryName(item.category) : "",
        qty: item.quantity ?? "",
        unit: item.unit ?? "",
        unitPrice: item.unit_price ?? "",
        total: item.total_price,
        vat: item.vat_code ?? "",
        id: r.id,
      });
    });
  }

  for (const ws of [sheet, items]) {
    ws.getRow(1).font = { bold: true };
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
  return Buffer.from(await book.xlsx.writeBuffer());
}

/** A real date cell (so Excel can sort and filter by it), at noon UTC to avoid time-zone day shifts. */
const asDate = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`) : "");
