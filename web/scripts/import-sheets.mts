/**
 * One-time import of receipts from the old Google Sheet into the database.
 *
 *   npm run import:sheets -- --email you@gmail.com [--categorize] [--dry-run]
 *
 * Needs in the environment (or .env.local): DATABASE_URL, GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL,
 * GOOGLE_PRIVATE_KEY, and GEMINI_API_KEY for --categorize. Safe to run again: already imported receipts are skipped.
 */
import { parseArgs } from "node:util";

import { ReceiptStore } from "../lib/db/store";
import { extractorFromEnv } from "../lib/gemini";
import { importFromSheet } from "../lib/legacy/import";
import { SheetsReader } from "../lib/legacy/sheets-reader";

const { values } = parseArgs({
  options: { email: { type: "string" }, categorize: { type: "boolean", default: false }, "dry-run": { type: "boolean", default: false } },
});

function need(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Put it in .env.local or the environment.`);
    process.exit(1);
  }
  return value;
}

if (!values.email) {
  console.error("Usage: npm run import:sheets -- --email you@gmail.com [--categorize] [--dry-run]");
  process.exit(1);
}
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) need("DATABASE_URL");

const reader = new SheetsReader(need("GOOGLE_SHEET_ID"), need("GOOGLE_SERVICE_ACCOUNT_EMAIL"), need("GOOGLE_PRIVATE_KEY"));
const store = new ReceiptStore();
const extractor = values.categorize ? (need("GEMINI_API_KEY"), extractorFromEnv()) : null;

const receipts = await reader.list();
console.log(`Read ${receipts.length} receipts from the Google Sheet.`);
const report = await importFromSheet({
  receipts,
  store,
  userId: await store.userId(values.email),
  categorize: extractor ? (names) => extractor.categorize(names) : undefined,
  dryRun: values["dry-run"],
  log: (line) => console.log("  " + line),
});

const eur = (cents: number) => `${(cents / 100).toFixed(2)} €`;
console.log(`
${values["dry-run"] ? "Dry run, nothing written." : "Done."}
  imported:          ${report.imported}
  already there:     ${report.duplicates}
  skipped (invalid): ${report.invalid.length}${report.invalid.map((r) => `\n    - ${r}`).join("")}
  categorised:       ${report.categorized} products
  sheet total:       ${eur(report.sheetTotalCents)}
  in database now:   ${eur(report.importedTotalCents)} ${report.sheetTotalCents === report.importedTotalCents ? "✓ matches" : "✗ differs (see skipped)"}`);
process.exit(0);
