import type { Receipt } from "./receipt";

/** Deterministic checks on an extracted receipt. The model reads; this code does the maths. */

const TOLERANCE_CENTS = 1;
const LINE_TOLERANCE = 0.02; // weighed items are rounded per line

const cents = (amount: number) => Math.round(amount * 100);
const eur = (centsValue: number) => (centsValue / 100).toFixed(2);

export function validateReceipt(receipt: Receipt): string[] {
  const issues: string[] = [];

  if (receipt.line_items.length === 0) issues.push("No line items were extracted.");

  const itemsSum = receipt.line_items.reduce((sum, item) => sum + cents(item.total_price), 0);
  const total = cents(receipt.total);
  if (Math.abs(itemsSum - total) > TOLERANCE_CENTS) {
    issues.push(`Line items add up to ${eur(itemsSum)} EUR but the receipt total is ${eur(total)} EUR.`);
  }

  receipt.line_items.forEach((item, index) => {
    if (item.quantity !== null && item.unit_price !== null) {
      const expected = item.quantity * item.unit_price;
      if (Math.abs(expected - item.total_price) > LINE_TOLERANCE) {
        issues.push(
          `Line ${index + 1} '${item.raw_text}': ${item.quantity} x ${item.unit_price.toFixed(2)} = ${expected.toFixed(2)}, ` +
            `but the line total is ${item.total_price.toFixed(2)}.`,
        );
      }
    }
  });

  const gross = receipt.vat_summary.map((entry) => entry.gross).filter((value): value is number => value !== null);
  if (gross.length > 0) {
    const vatGross = gross.reduce((sum, value) => sum + cents(value), 0);
    // Deposit returns sometimes sit outside the VAT table, so only flag a mismatch against both sums.
    if (vatGross !== total && vatGross !== itemsSum) {
      issues.push(`VAT table gross sum ${eur(vatGross)} EUR does not match the total ${eur(total)} EUR.`);
    }
  }

  if (receipt.date !== null && !isValidIsoDate(receipt.date)) {
    issues.push(`Date '${receipt.date}' is not a valid YYYY-MM-DD date.`);
  }

  return issues;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}
