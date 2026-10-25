import type { Metadata } from "next";
import Link from "next/link";

import { ExportButton } from "@/components/export-button";
import { ChartIcon } from "@/components/icons";
import { ReceiptList } from "@/components/receipt-list";
import { CategoryBreakdown, MonthChart, MonthHeadline } from "@/components/spending";
import { button, EmptyState, PageHeader } from "@/components/ui";
import { isMonth, monthOf, shiftMonth, todayIso } from "@/lib/dates";
import { monthLabel } from "@/lib/format";
import { categoryBreakdown, categoryProducts, chartMonths, monthExtras, monthSummary } from "@/lib/month-stats";
import { loadPageData } from "@/lib/page-data";

export const metadata: Metadata = { title: "Spending" };

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
        <PageHeader title="Spending" subtitle="Where your supermarket money goes." />
        <EmptyState icon={<ChartIcon size={28} />} title="Nothing to show yet">
          <p>Your dashboard fills in as you save receipts.</p>
          <Link href="/" className={`${button.primary} mt-4`}>
            Scan a receipt
          </Link>
        </EmptyState>
      </>
    );
  }

  const summary = monthSummary(month, receipts, previous, today);
  // While a month is running, compare it with the same days of the month before, not the whole month.
  const comparable = summary.partial ? previous.filter((r) => Number(r.date!.slice(8, 10)) <= summary.partial!.throughDay) : previous;
  const compareLabel = summary.partial
    ? `change vs 1–${summary.partial.throughDay} ${monthLabel(summary.previousMonth).split(" ")[0]}`
    : `change vs ${monthLabel(summary.previousMonth, "long").split(" ")[0]}`;
  const category = typeof params.category === "string" ? params.category : null;

  return (
    <>
      <PageHeader title="Spending" subtitle="Tap a month to see where the money went." />
      <div className="space-y-4">
        <MonthChart bars={chart.bars} averageCents={chart.averageCents} selected={month} />
        <MonthHeadline summary={summary} averageCents={chart.averageCents} />
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
            <h2 className="font-semibold">Receipts in {monthLabel(month, "long")}</h2>
            {receipts.length > 0 && <ExportButton month={month} label="Export month" />}
          </div>
          {receipts.length ? <ReceiptList receipts={receipts} /> : <p className="px-1 text-sm text-muted">No receipts in this month.</p>}
        </section>
      </div>
    </>
  );
}
