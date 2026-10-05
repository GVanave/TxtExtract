import type { Metadata } from "next";
import Link from "next/link";

import { ChartIcon } from "@/components/icons";
import { loadReceipts } from "@/components/load-receipts";
import { SheetLink } from "@/components/sheet-link";
import { button, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { byStore, extras, monthlyTotals, overview, topProducts } from "@/lib/analytics";
import { euro, monthLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Spending" };

export default async function SpendingPage() {
  const data = await loadReceipts();
  if (!data.ok) return data.message;
  const { receipts, sheetUrl } = data;

  if (receipts.length === 0) {
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

  const o = overview(receipts);
  const change = o.thisMonth - o.lastMonth;
  const months = monthlyTotals(receipts).slice(-12);
  const stores = byStore(receipts).slice(0, 8);
  const products = topProducts(receipts, 10);
  const x = extras(receipts);
  const maxMonth = Math.max(...months.map((m) => m.total), 1);
  const maxStore = Math.max(...stores.map((s) => s.total), 1);
  const maxProduct = Math.max(...products.map((p) => p.spent), 1);

  return (
    <>
      <PageHeader title="Spending" subtitle="Where your supermarket money goes." action={<SheetLink url={sheetUrl} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="This month"
          value={euro(o.thisMonth)}
          hint={
            o.lastMonth ? (
              <span className={change > 0 ? "text-warn" : "text-ok"}>
                {change > 0 ? "▲" : "▼"} {euro(Math.abs(change))} vs last month
              </span>
            ) : (
              "No data for last month"
            )
          }
        />
        <Stat label="All time" value={euro(o.totalSpent)} />
        <Stat label="Receipts" value={String(o.receipts)} hint={o.needsReview ? `${o.needsReview} marked for review` : undefined} />
        <Stat label="Average receipt" value={euro(o.avgReceipt)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-4 font-semibold">Per month</h2>
          <div className="flex h-52 items-end gap-2" role="list" aria-label="Spending per month">
            {months.map((m) => (
              <div key={m.month} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span className="tabular text-[11px] text-muted">{Math.round(m.total)} €</span>
                <div
                  className="w-full max-w-14 rounded-t-md bg-bar transition-all"
                  style={{ height: `${Math.max(3, (m.total / maxMonth) * 100)}%` }}
                  title={`${monthLabel(m.month, "long")}: ${euro(m.total)} (${m.receipts} receipts)`}
                />
                <span className="truncate text-[11px] text-muted">{monthLabel(m.month).split(" ")[0]} &apos;{m.month.slice(2, 4)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-semibold">By store</h2>
          <ul className="space-y-3">
            {stores.map((s) => (
              <li key={s.store}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="truncate font-medium">{s.store}</span>
                  <span className="tabular text-muted">
                    {euro(s.total)} · {s.visits}×
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-bar" style={{ width: `${(s.total / maxStore) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-3 font-semibold">Top products</h2>
          {products.length === 0 ? (
            <p className="text-sm text-muted">No products yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {products.map((p) => (
                <li key={p.product} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="truncate text-sm font-medium">{p.product}</span>
                  <span className="tabular text-sm">
                    {euro(p.spent)} <span className="text-muted">· {p.timesBought}×</span>
                  </span>
                  <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-bar/70" style={{ width: `${(p.spent / maxProduct) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Pfand &amp; discounts</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-ok-soft p-3">
              <p className="text-xs text-muted">Saved by discounts</p>
              <p className="tabular mt-1 text-xl font-semibold text-ok">{euro(x.discountsSaved)}</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-muted">Open Pfand</p>
              <p className="tabular mt-1 text-xl font-semibold">{euro(x.depositOpen)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Pfand paid {euro(x.depositPaid)} · returned {euro(x.depositReturned)}. Open Pfand is deposit on bottles not returned yet.
          </p>
        </Card>
      </div>
    </>
  );
}
