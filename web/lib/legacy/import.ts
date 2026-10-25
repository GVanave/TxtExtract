import type { CategorySlug } from "../categories";
import type { ReceiptStore } from "../db/store";
import type { Receipt } from "../receipt";
import { isValidIsoDate, validateReceipt } from "../validation";
import type { SavedReceipt as SheetReceipt } from "./sheet-rows";

export type ImportReport = {
  read: number;
  imported: number;
  duplicates: number;
  invalid: string[];
  categorized: number;
  sheetTotalCents: number;
  importedTotalCents: number;
};

/**
 * Copies receipts from the old Google Sheet into the database. Safe to run twice: receipts that are already
 * there (same store, day, time and total) are skipped. `categorize` fills in categories, e.g. with Gemini.
 */
export async function importFromSheet(options: {
  receipts: SheetReceipt[];
  store: ReceiptStore;
  userId: string;
  categorize?: (names: string[]) => Promise<(CategorySlug | null)[]>;
  dryRun?: boolean;
  log?: (line: string) => void;
}): Promise<ImportReport> {
  const { store, userId, log = () => {} } = options;
  const report: ImportReport = { read: options.receipts.length, imported: 0, duplicates: 0, invalid: [], categorized: 0, sheetTotalCents: 0, importedTotalCents: 0 };

  // Oldest first, so the database fills up in the order you shopped.
  for (const row of [...options.receipts].reverse()) {
    const cents = Math.round(row.total * 100);
    report.sheetTotalCents += cents;
    const date = row.date && isValidIsoDate(row.date) ? row.date : row.saved_at.slice(0, 10);
    const label = `${row.store_name} ${date} ${row.total.toFixed(2)} €`;
    if (!row.store_name.trim() || !isValidIsoDate(date)) {
      report.invalid.push(`${row.id} (${label}): no store or date`);
      continue;
    }

    let receipt: Receipt = {
      store_name: row.store_name,
      store_address: row.store_address,
      date,
      time: row.time,
      currency: row.currency,
      total: row.total,
      payment_method: row.payment_method,
      vat_summary: [],
      line_items: row.line_items.map((item) => ({ ...item, category: null, category_source: null })),
    };

    if (await store.findDuplicate(userId, receipt)) {
      report.duplicates += 1;
      report.importedTotalCents += cents;
      log(`skip (already imported): ${label}`);
      continue;
    }

    // Your earlier corrections first, then Gemini for the rest.
    receipt = await store.applyMemory(userId, receipt);
    if (options.categorize) {
      const missing = receipt.line_items.map((item, i) => ({ item, i })).filter(({ item }) => item.line_type === "product" && !item.category);
      if (missing.length) {
        const slugs = await options.categorize(missing.map(({ item }) => item.name || item.raw_text));
        receipt = {
          ...receipt,
          line_items: receipt.line_items.map((item, i) => {
            const slug = slugs[missing.findIndex((m) => m.i === i)];
            return slug ? { ...item, category: slug, category_source: "model" as const } : item;
          }),
        };
        report.categorized += slugs.filter(Boolean).length;
      }
    }

    if (!options.dryRun) await store.save(userId, receipt, { issues: validateReceipt(receipt), model: row.model, imageName: row.image_name });
    report.imported += 1;
    report.importedTotalCents += cents;
    log(`${options.dryRun ? "would import" : "imported"}: ${label} (${receipt.line_items.length} lines)`);
  }
  return report;
}
