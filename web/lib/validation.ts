import { euro } from "./format";
import type { Receipt } from "./receipt";

/** Deterministic checks on an extracted receipt. The model reads; this code does the maths. */

const TOLERANCE_CENTS = 1;
const LINE_TOLERANCE = 0.02; // weighed items are rounded per line

const cents = (amount: number) => Math.round(amount * 100);
const eur = (centsValue: number) => euro(centsValue / 100);
const num = (n: number) => String(n).replace(".", ",");

export function validateReceipt(receipt: Receipt): string[] {
  const issues: string[] = [];

  if (receipt.line_items.length === 0) issues.push("Es wurden keine Produkte erkannt.");

  const itemsSum = receipt.line_items.reduce((sum, item) => sum + cents(item.total_price), 0);
  const total = cents(receipt.total);
  if (Math.abs(itemsSum - total) > TOLERANCE_CENTS) {
    issues.push(`Die Preise ergeben zusammen ${eur(itemsSum)}, auf dem Kassenbon steht aber ${eur(total)}.`);
  }

  receipt.line_items.forEach((item, index) => {
    if (item.quantity !== null && item.unit_price !== null) {
      const expected = item.quantity * item.unit_price;
      if (Math.abs(expected - item.total_price) > LINE_TOLERANCE) {
        issues.push(
          `Bei „${item.name || item.raw_text}“ (Zeile ${index + 1}) passt die Rechnung nicht: ` +
            `${num(item.quantity)} × ${euro(item.unit_price)} sind ${euro(expected)}, eingetragen ist ${euro(item.total_price)}.`,
        );
      }
    }
  });

  const gross = receipt.vat_summary.map((entry) => entry.gross).filter((value): value is number => value !== null);
  if (gross.length > 0) {
    const vatGross = gross.reduce((sum, value) => sum + cents(value), 0);
    // Deposit returns sometimes sit outside the VAT table, so only flag a mismatch against both sums.
    if (vatGross !== total && vatGross !== itemsSum) {
      issues.push(`Die MwSt.-Übersicht ergibt ${eur(vatGross)}, die Summe ist aber ${eur(total)}.`);
    }
  }

  if (receipt.date !== null && !isValidIsoDate(receipt.date)) {
    issues.push(`Das Datum „${receipt.date}“ ist ungültig.`);
  }

  return issues;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
