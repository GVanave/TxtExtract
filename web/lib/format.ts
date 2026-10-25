const euroFormat = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export const euro = (amount: number | null | undefined) => (amount === null || amount === undefined ? "–" : euroFormat.format(amount));

/** "2026-10-02" -> "02.10.2026" */
export function germanDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/** "2026-10" -> "Oct 2026" */
export function monthLabel(key: string, style: "short" | "long" = "short"): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: style, year: "numeric", timeZone: "UTC" });
}
