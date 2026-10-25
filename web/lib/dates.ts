/** Dates are calendar dates as printed on German receipts, so "today" is taken in German time by default. */
export const APP_TIME_ZONE = process.env.APP_TIME_ZONE || "Europe/Berlin";

export function todayIso(now = new Date(), timeZone = APP_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const monthOf = (isoDate: string) => isoDate.slice(0, 7);

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const isMonth = (value: unknown): value is string => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
