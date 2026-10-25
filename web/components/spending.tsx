import Link from "next/link";

import { euro, monthLabel } from "@/lib/format";
import type { CategoryRow, MonthBar, MonthSummary, ProductRow } from "@/lib/month-stats";

import { Card } from "./ui";

const eur = (cents: number) => euro(cents / 100);
const shortMonth = (month: string) => `${monthLabel(month).split(" ")[0]} '${month.slice(2, 4)}`;

/** "+12,30 €" in warning colour when spending went up, "−4,10 €" in green when it went down. */
export function Delta({ cents, className = "" }: { cents: number; className?: string }) {
  if (cents === 0) return <span className={`text-muted ${className}`}>±0,00 €</span>;
  const up = cents > 0;
  return (
    <span className={`tabular ${up ? "text-warn" : "text-ok"} ${className}`}>
      {up ? "▲ +" : "▼ −"}
      {eur(Math.abs(cents)).replace("-", "")}
    </span>
  );
}

/** Bars for the last months; tapping one opens its breakdown below (plain links: fast, works with the back button). */
export function MonthChart({ bars, averageCents, selected }: { bars: MonthBar[]; averageCents: number | null; selected: string }) {
  const max = Math.max(...bars.map((b) => b.totalCents), averageCents ?? 0, 1);
  const LABEL = "1.25rem"; // space for the amount above each bar
  const height = (cents: number) => `calc((100% - ${LABEL}) * ${cents / max})`;

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Last {bars.length === 1 ? "month" : `${bars.length} months`}</h2>
        {averageCents !== null && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="inline-block w-4 border-t-2 border-dashed border-muted" aria-hidden="true" />Ø {eur(averageCents)}
          </span>
        )}
      </div>
      <div className="relative h-44">
        {averageCents !== null && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted/60"
            style={{ bottom: height(averageCents) }}
            aria-hidden="true"
          />
        )}
        {/* Bars sit above the average line; amounts get a background so the line never runs through them. */}
        <div className="relative flex h-full items-end gap-2 sm:gap-4">
          {bars.map((bar) => {
            const isSelected = bar.month === selected;
            return (
              <Link
                key={bar.month}
                href={`/spending?month=${bar.month}`}
                scroll={false}
                aria-current={isSelected ? "true" : undefined}
                aria-label={`${monthLabel(bar.month, "long")}${bar.current ? " so far" : ""}: ${eur(bar.totalCents)}, ${bar.trips} receipts`}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <span className={`tabular mb-1 rounded bg-surface px-1 text-[11px] sm:text-xs ${isSelected ? "font-semibold text-ink" : "text-muted"}`}>
                  {Math.round(bar.totalCents / 100)} €
                </span>
                <span
                  className={`block w-full max-w-16 rounded-t-lg transition ${
                    isSelected ? "bg-brand ring-2 ring-brand/30" : "bg-bar/35 group-hover:bg-bar/60"
                  } ${bar.current ? "bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgba(255,255,255,0.25)_6px_12px)]" : ""}`}
                  style={{ height: height(bar.totalCents), minHeight: 4 }}
                />
              </Link>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4">
        {bars.map((bar) => (
          <span key={bar.month} className={`min-w-0 flex-1 truncate text-center text-[11px] sm:text-xs ${bar.month === selected ? "font-semibold text-ink" : "text-muted"}`}>
            {shortMonth(bar.month)}
            {bar.current && <span className="block text-[10px] font-normal text-muted">so far</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}

export function MonthHeadline({ summary, averageCents }: { summary: MonthSummary; averageCents: number | null }) {
  const { partial } = summary;
  const compareCents = partial ? partial.previousSamePeriodCents : summary.previousCents;
  const compareLabel = partial
    ? `vs 1–${partial.throughDay} ${monthLabel(summary.previousMonth).split(" ")[0]}`
    : `vs ${monthLabel(summary.previousMonth, "long").split(" ")[0]}`;

  return (
    <Card>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-sm font-medium text-muted">
            {monthLabel(summary.month, "long")}
            {partial ? ` · 1–${partial.throughDay} so far` : ""}
          </h2>
          <p className="tabular mt-0.5 text-3xl font-bold tracking-tight">{eur(summary.totalCents)}</p>
          <p className="mt-0.5 text-sm text-muted">
            {summary.trips} {summary.trips === 1 ? "trip" : "trips"} · Ø {eur(summary.perTripCents)} per trip
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {compareCents !== null && (
            <>
              <dt className="text-muted">{compareLabel}</dt>
              <dd className="text-right">
                <Delta cents={summary.totalCents - compareCents} />
              </dd>
            </>
          )}
          {averageCents !== null && !partial && (
            <>
              <dt className="text-muted">vs Ø of full months</dt>
              <dd className="text-right">
                <Delta cents={summary.totalCents - averageCents} />
              </dd>
            </>
          )}
        </dl>
      </div>
    </Card>
  );
}

/** Categories as rows; the selected one opens its products right below it. */
export function CategoryBreakdown(props: {
  month: string;
  rows: CategoryRow[];
  selected: string | null;
  products: ProductRow[];
  compareLabel: string;
  extras: { pfandPaid: number; pfandReturned: number; discountsSaved: number };
}) {
  const max = Math.max(...props.rows.map((r) => r.cents), 1);
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">By category</h2>
        <span className="text-xs text-muted">{props.compareLabel}</span>
      </div>
      {props.rows.length === 0 ? (
        <p className="text-sm text-muted">No products this month.</p>
      ) : (
        <ul className="divide-y divide-line" id="categories">
          {props.rows.map((row) => {
            const open = row.slug === props.selected;
            return (
              <li key={row.slug}>
                <Link
                  href={open ? `/spending?month=${props.month}` : `/spending?month=${props.month}&category=${row.slug}`}
                  scroll={false}
                  aria-expanded={open}
                  className="-mx-2 block rounded-lg px-2 py-2.5 transition hover:bg-surface-2"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`truncate text-sm ${open ? "font-semibold" : "font-medium"}`}>
                      <span className={`mr-1.5 inline-block text-muted transition ${open ? "rotate-90" : ""}`} aria-hidden="true">
                        ›
                      </span>
                      {row.name}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-3 text-sm">
                      <Delta cents={row.cents - row.previousCents} className="hidden text-xs sm:inline" />
                      <span className="tabular w-20 text-right font-semibold">{eur(row.cents)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className={`h-full rounded-full ${open ? "bg-brand" : "bg-bar/70"}`} style={{ width: `${(Math.max(row.cents, 0) / max) * 100}%` }} />
                    </div>
                    <span className="tabular w-9 text-right text-[11px] text-muted">{row.share} %</span>
                    <Delta cents={row.cents - row.previousCents} className="text-[11px] sm:hidden" />
                  </div>
                </Link>
                {open && <ProductList products={props.products} />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
        Pfand paid {eur(props.extras.pfandPaid)} · returned {eur(props.extras.pfandReturned)} (not counted in categories) · discounts saved{" "}
        <span className="text-ok">{eur(props.extras.discountsSaved)}</span>
      </p>
    </Card>
  );
}

function ProductList({ products }: { products: ProductRow[] }) {
  return (
    <ul className="mb-2 ml-4 space-y-1 border-l-2 border-brand/30 pl-3" aria-label="Products">
      {products.map((p) => (
        <li key={p.name} className="flex items-baseline justify-between gap-3 py-1 text-sm">
          <span className="min-w-0">
            <span className="block truncate">{p.name}</span>
            <span className="block truncate text-[11px] text-muted">
              {p.times}× · {p.stores.join(", ")}
              {p.discountCents > 0 && <span className="text-ok"> · incl. −{eur(p.discountCents)} discount</span>}
            </span>
          </span>
          <span className="tabular shrink-0 font-medium">{eur(p.spentCents)}</span>
        </li>
      ))}
    </ul>
  );
}
