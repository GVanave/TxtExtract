import Link from "next/link";

import { categoryIcon } from "@/lib/categories";
import { differenceInWords, euroFromCents as eur, monthLabel, monthName, monthShort } from "@/lib/format";
import type { CategoryRow, MonthBar, MonthSummary, ProductRow } from "@/lib/month-stats";

import { LinkPending } from "./link-pending";
import { Card } from "./ui";

/** "3,19 € mehr" in warning colour when spending went up, "0,61 € weniger" in green when it went down. */
export function Change({ cents, className = "" }: { cents: number; className?: string }) {
  const tone = cents > 0 ? "text-warn" : cents < 0 ? "text-ok" : "text-muted";
  return <span className={`tabular ${tone} ${className}`}>{differenceInWords(cents)}</span>;
}

/** Bars for the last months; tapping one opens its breakdown below (plain links: fast, works with the back button). */
export function MonthChart({ bars, averageCents, selected }: { bars: MonthBar[]; averageCents: number | null; selected: string }) {
  const max = Math.max(...bars.map((b) => b.totalCents), averageCents ?? 0, 1);
  const LABEL = "1.5rem"; // space for the amount above each bar
  const height = (cents: number) => `calc((100% - ${LABEL}) * ${cents / max})`;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Letzte {bars.length === 1 ? "Monat" : `${bars.length} Monate`}</h2>
        {averageCents !== null && (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <span className="inline-block w-4 border-t-2 border-dashed border-muted" aria-hidden="true" />
            Durchschnitt {eur(averageCents)}
          </span>
        )}
      </div>
      <div className="relative h-48">
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
                aria-label={`${monthLabel(bar.month)}${bar.current ? " (läuft noch)" : ""}: ${eur(bar.totalCents)}, ${bar.trips} Einkäufe`}
                className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
              >
                <LinkPending />
                <span className={`tabular mb-1 rounded bg-surface px-1 text-sm ${isSelected ? "font-bold text-ink" : "text-muted"}`}>
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
          <span key={bar.month} className={`min-w-0 flex-1 whitespace-nowrap text-center text-xs sm:text-sm ${bar.month === selected ? "font-bold text-ink" : "text-muted"}`}>
            {monthShort(bar.month)}
            {bar.current && <span className="block text-xs font-normal text-muted">läuft noch</span>}
          </span>
        ))}
      </div>
    </Card>
  );
}

/** The month in whole sentences: how much, how often, and compared with before. */
export function MonthHeadline({ summary, averageCents }: { summary: MonthSummary; averageCents: number | null }) {
  const { partial } = summary;
  const name = monthName(summary.month);
  const previous = monthName(summary.previousMonth);
  const trips = `${summary.trips} ${summary.trips === 1 ? "Einkauf" : "Einkäufen"}`;

  let comparison: React.ReactNode = null;
  if (partial) {
    if (summary.previousCents !== null) {
      comparison = (
        <>
          Im gleichen Zeitraum im {previous} waren es {eur(partial.previousSamePeriodCents)}. Das sind jetzt{" "}
          <Change cents={summary.totalCents - partial.previousSamePeriodCents} className="font-semibold" />.
        </>
      );
    }
  } else if (summary.previousCents !== null) {
    comparison = (
      <>
        Das sind <Change cents={summary.totalCents - summary.previousCents} className="font-semibold" /> als im {previous}.
      </>
    );
  }

  return (
    <Card>
      <h2 className="text-base font-medium text-muted">
        {monthLabel(summary.month)}
        {partial ? " (läuft noch)" : ""}
      </h2>
      <p className="tabular mt-0.5 text-4xl font-bold tracking-tight">{eur(summary.totalCents)}</p>
      <p className="mt-2 text-lg">
        Im {name} hast du {partial ? "bis heute " : ""}
        <strong>{eur(summary.totalCents)}</strong> ausgegeben, bei {trips} (im Schnitt {eur(summary.perTripCents)} pro Einkauf).
      </p>
      {comparison && <p className="mt-1 text-lg">{comparison}</p>}
      {averageCents !== null && !partial && (
        <p className="mt-1 text-base text-muted">
          Dein Durchschnitt pro Monat: {eur(averageCents)} ({differenceInWords(summary.totalCents - averageCents)} in diesem Monat).
        </p>
      )}
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
      <h2 className="text-lg font-semibold">Wofür du Geld ausgegeben hast</h2>
      <p className="mb-2 text-sm text-muted">Tippe auf eine Kategorie für die einzelnen Produkte. {props.compareLabel}</p>
      {props.rows.length === 0 ? (
        <p className="text-muted">In diesem Monat gibt es keine Produkte.</p>
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
                  className="relative -mx-2 block rounded-lg px-2 py-3 transition hover:bg-surface-2"
                >
                  <LinkPending />
                  <div className="flex items-center justify-between gap-3">
                    <span className={`flex min-w-0 items-center gap-2 text-lg ${open ? "font-semibold" : "font-medium"}`}>
                      <span aria-hidden="true">{categoryIcon(row.slug)}</span>
                      <span className="truncate">{row.name}</span>
                    </span>
                    <span className="tabular shrink-0 text-lg font-semibold">{eur(row.cents)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div className={`h-full rounded-full ${open ? "bg-brand" : "bg-bar/70"}`} style={{ width: `${(Math.max(row.cents, 0) / max) * 100}%` }} />
                    </div>
                    <span className="tabular w-11 text-right text-sm text-muted">{row.share} %</span>
                  </div>
                  <p className="mt-1 text-sm">
                    <Change cents={row.cents - row.previousCents} />
                  </p>
                </Link>
                {open && <ProductList products={props.products} />}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-3 text-base text-muted">
        Durch Rabatte gespart: <span className="font-semibold text-ok">{eur(props.extras.discountsSaved)}</span>
        <br />
        Pfand: {eur(props.extras.pfandPaid)} bezahlt, {eur(props.extras.pfandReturned)} zurückbekommen (nicht in den Kategorien enthalten).
      </p>
    </Card>
  );
}

function ProductList({ products }: { products: ProductRow[] }) {
  return (
    <ul className="mb-2 ml-4 space-y-1 border-l-2 border-brand/30 pl-3" aria-label="Produkte">
      {products.map((p) => (
        <li key={p.name} className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="min-w-0">
            <span className="block truncate text-base">{p.name}</span>
            <span className="block truncate text-sm text-muted">
              {p.times}× · {p.stores.join(", ")}
              {p.discountCents > 0 && <span className="text-ok"> · inkl. {eur(p.discountCents)} Rabatt</span>}
            </span>
          </span>
          <span className="tabular shrink-0 text-base font-medium">{eur(p.spentCents)}</span>
        </li>
      ))}
    </ul>
  );
}
