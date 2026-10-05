import type { Metadata } from "next";
import Link from "next/link";

import { ChevronIcon, ReceiptIcon } from "@/components/icons";
import { loadReceipts } from "@/components/load-receipts";
import { SheetLink } from "@/components/sheet-link";
import { button, EmptyState, PageHeader, ReviewBadge } from "@/components/ui";
import { receiptMonth } from "@/lib/analytics";
import { euro, germanDate, monthLabel } from "@/lib/format";
import type { SavedReceipt } from "@/lib/receipt";

export const metadata: Metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  const data = await loadReceipts();
  if (!data.ok) return data.message;
  const { receipts, sheetUrl } = data;

  const months = new Map<string, SavedReceipt[]>();
  for (const r of receipts) months.set(receiptMonth(r), [...(months.get(receiptMonth(r)) ?? []), r]);

  return (
    <>
      <PageHeader
        title="Receipts"
        subtitle={`${receipts.length} saved · ${euro(receipts.reduce((s, r) => s + r.total, 0))}`}
        action={<SheetLink url={sheetUrl} />}
      />
      {receipts.length === 0 ? (
        <EmptyState icon={<ReceiptIcon size={28} />} title="No receipts yet">
          <p>Scan your first receipt and it shows up here and in your Google Sheet.</p>
          <Link href="/" className={`${button.primary} mt-4`}>
            Scan a receipt
          </Link>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {[...months.entries()].map(([month, list]) => (
            <section key={month}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="font-semibold">{monthLabel(month, "long")}</h2>
                <span className="tabular text-sm text-muted">{euro(list.reduce((s, r) => s + r.total, 0))}</span>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {list.map((r) => (
                  <li key={r.id}>
                    <Link href={`/receipts/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-bold text-brand-strong">
                        {r.store_name.trim().slice(0, 2).toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{r.store_name}</p>
                        <p className="text-xs text-muted">
                          {germanDate(r.date) || "No date"}
                          {r.time ? ` · ${r.time}` : ""} · {r.line_items.length} items
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular font-semibold">{euro(r.total)}</span>
                        {r.needs_review && <ReviewBadge needsReview />}
                      </div>
                      <ChevronIcon size={18} className="shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
