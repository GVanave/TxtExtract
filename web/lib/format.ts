const euroFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export const euro = (amount: number | null | undefined) => (amount === null || amount === undefined ? "–" : euroFormat.format(amount));
export const euroFromCents = (cents: number) => euro(cents / 100);

/** "2026-10-02" -> "02.10.2026" */
export function germanDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

// Fixed lists instead of Intl, so every browser and server writes the same words.
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const parts = (key: string) => key.split("-").map(Number) as [number, number];

/** "2026-10" -> "Oktober" */
export function monthName(key: string): string {
  return MONTHS[parts(key)[1] - 1] ?? key;
}

/** "2026-10" -> "Oktober 2026" */
export function monthLabel(key: string): string {
  const [y, m] = parts(key);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : key;
}

/** "2026-10" -> "Okt '26" (for chart labels) */
export function monthShort(key: string): string {
  const [y, m] = parts(key);
  return MONTHS_SHORT[m - 1] ? `${MONTHS_SHORT[m - 1]} '${String(y).slice(2)}` : key;
}

/** A difference in plain words: "57,46 € mehr" / "12,30 € weniger" / "genauso viel". */
export function differenceInWords(cents: number): string {
  if (cents === 0) return "genauso viel";
  return `${euroFromCents(Math.abs(cents))} ${cents > 0 ? "mehr" : "weniger"}`;
}
