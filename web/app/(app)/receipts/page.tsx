import type { Metadata } from "next";
import Link from "next/link";

import { ExportButton } from "@/components/export-button";
import { ReceiptIcon } from "@/components/icons";
import { ReceiptList } from "@/components/receipt-list";
import { button, EmptyState, PageHeader } from "@/components/ui";
import { monthOf } from "@/lib/dates";
import { euro, monthLabel } from "@/lib/format";
import { loadPageData } from "@/lib/page-data";
import type { SavedReceipt } from "@/lib/receipt";

export const metadata: Metadata = { title: "Receipts" };

export default async function ReceiptsPage() {
  const result = await loadPageData(({ store, userId }) => store.list(userId));
  if (!result.ok) return result.message;
  const receipts = result.data;

  const months = new Map<string, SavedReceipt[]>();
  for (const r of receipts) months.set(monthOf(r.date!), [...(months.get(monthOf(r.date!)) ?? []), r]);

  return (
    <>
      <PageHeader
        title="Receipts"
        subtitle={`${receipts.length} saved · ${euro(receipts.reduce((s, r) => s + r.total, 0))}`}
        action={receipts.length ? <ExportButton /> : undefined}
      />
      {receipts.length === 0 ? (
        <EmptyState icon={<ReceiptIcon size={28} />} title="No receipts yet">
          <p>Scan your first receipt and it shows up here.</p>
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
              <ReceiptList receipts={list} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
