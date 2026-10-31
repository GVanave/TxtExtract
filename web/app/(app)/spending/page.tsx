import type { Metadata } from "next";
import Link from "next/link";

import { DayChart } from "@/components/day-chart";
import { ExportButton } from "@/components/export-button";
import { ChartIcon } from "@/components/icons";
import { ReceiptList } from "@/components/receipt-list";
import { CategoryBreakdown, MonthChart, MonthHeadline } from "@/components/spending";
import { button, EmptyState, PageHeader } from "@/components/ui";
import { daysInMonth, isMonth, monthOf, shiftMonth, todayIso } from "@/lib/dates";
import { monthLabel, monthName } from "@/lib/format";
import { categoryBreakdown, categoryProducts, chartMonths, dailyTotals, monthExtras, monthSummary } from "@/lib/month-stats";
import { loadPageData } from "@/lib/page-data";

export const metadata: Metadata = { title: "Ausgaben" };

export default async function SpendingPage(props: PageProps<"/spending">) {
  const params = await props.searchParams;
  const today = todayIso();

  const result = await loadPageData(async ({ store, userId }) => {
    const chart = chartMonths(await store.monthTotals(userId), today);
    const month = isMonth(params.month) ? params.month : (chart.bars.at(-1)?.month ?? monthOf(today));
    const [receipts, previous] = await Promise.all([
      store.list(userId, { month }),
      store.list(userId, { month: shiftMonth(month, -1) }),
    ]);
    return { chart, month, receipts, previous };
  });
  if (!result.ok) return result.message;
  const { chart, month, receipts, previous } = result.data;

  if (chart.bars.length === 0) {
    return (
      <>
        <PageHeader title="Ausgaben" subtitle="Hier siehst du, wofür du im Supermarkt Geld ausgibst." />
        <EmptyState icon={<ChartIcon size={28} />} title="Noch keine Ausgaben">
          <p>Sobald du Kassenbons speicherst, erscheinen sie hier.</p>
          <Link href="/" className={`${button.primary} mt-4`}>
            Kassenbon fotografieren
          </Link>
        </EmptyState>
      </>
    );
  }

  const summary = monthSummary(month, receipts, previous, today);
  // While a month is running, compare it with the same days of the month before, not the whole month.
  const comparable = summary.partial ? previous.filter((r) => Number(r.date!.slice(8, 10)) <= summary.partial!.throughDay) : previous;
  // "1. bis 31. September" does not exist: once the running month is past the last day of the month before, compare whole months.
  const samePeriod = summary.partial !== null && summary.partial.throughDay < daysInMonth(summary.previousMonth);
  const compareLabel = samePeriod
    ? `Vergleich: 1. bis ${summary.partial!.throughDay}. ${monthName(summary.previousMonth)}.`
    : `Vergleich mit ${monthName(summary.previousMonth)}.`;
  const category = typeof params.category === "string" ? params.category : null;

  return (
    <>
      <PageHeader title="Ausgaben" subtitle="Tippe auf einen Monat, um zu sehen, wofür das Geld ausgegeben wurde." />
      <div className="space-y-4">
        <MonthChart bars={chart.bars} averageCents={chart.averageCents} selected={month} />
        <MonthHeadline summary={summary} averageCents={chart.averageCents} />
        <DayChart key={month} month={month} running={summary.partial !== null} {...dailyTotals(month, receipts, today)} />
        <CategoryBreakdown
          month={month}
          rows={categoryBreakdown(receipts, comparable)}
          selected={category}
          products={category ? categoryProducts(receipts, category) : []}
          compareLabel={compareLabel}
          extras={monthExtras(receipts)}
        />
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-lg font-semibold">Einkäufe im {monthLabel(month)}</h2>
            {receipts.length > 0 && <ExportButton month={month} label="Monat als Excel" />}
          </div>
          {receipts.length ? <ReceiptList receipts={receipts} /> : <p className="px-1 text-base text-muted">In diesem Monat gibt es keine Einkäufe.</p>}
        </section>
      </div>
    </>
  );
}
