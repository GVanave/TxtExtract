import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BackIcon } from "@/components/icons";
import { loadReceipts } from "@/components/load-receipts";
import { SheetLink } from "@/components/sheet-link";
import { Card, Notice, ReviewBadge } from "@/components/ui";
import { euro, germanDate } from "@/lib/format";
import { LINE_TYPE_LABELS } from "@/lib/receipt";

import { DeleteButton } from "./delete-button";

export const metadata: Metadata = { title: "Receipt" };

export default async function ReceiptPage(props: PageProps<"/receipts/[id]">) {
  const { id } = await props.params;
  const data = await loadReceipts();
  if (!data.ok) return data.message;
  const receipt = data.receipts.find((r) => r.id === id);
  if (!receipt) notFound();

  const details = [germanDate(receipt.date), receipt.time, receipt.payment_method, receipt.store_address].filter(Boolean);

  return (
    <div className="space-y-4">
      <Link href="/receipts" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <BackIcon size={16} /> Receipts
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{receipt.store_name}</h1>
              <ReviewBadge needsReview={receipt.needs_review} />
            </div>
            <p className="mt-1 text-sm text-muted">{details.join(" · ")}</p>
          </div>
          <p className="tabular text-3xl font-bold tracking-tight">{euro(receipt.total)}</p>
        </div>
        {receipt.issues.length > 0 && (
          <div className="mt-4">
            <Notice tone="warn" title="Saved for review">
              <ul className="list-disc pl-4">{receipt.issues.map((i) => <li key={i}>{i}</li>)}</ul>
            </Notice>
          </div>
        )}
      </Card>

      <Card className="p-0 sm:p-0">
        <ul className="divide-y divide-line">
          {receipt.line_items.map((item, index) => (
            <li key={index} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.name}</p>
                <p className="truncate text-xs text-muted">
                  {[
                    item.line_type !== "product" ? LINE_TYPE_LABELS[item.line_type] : null,
                    item.quantity !== null ? `${String(item.quantity).replace(".", ",")} ${item.unit ?? ""}`.trim() : null,
                    item.unit_price !== null ? `à ${euro(item.unit_price)}` : null,
                    item.raw_text !== item.name ? item.raw_text : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <span className={`tabular font-semibold ${item.total_price < 0 ? "text-ok" : ""}`}>{euro(item.total_price)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-line px-4 py-3 font-semibold">
          <span>Total</span>
          <span className="tabular">{euro(receipt.total)}</span>
        </div>
      </Card>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <DeleteButton id={receipt.id} />
        <SheetLink url={data.sheetUrl} />
      </div>
      <p className="text-xs text-muted">
        Saved {receipt.saved_at}
        {receipt.model ? ` · read by ${receipt.model}` : ""} · ID {receipt.id}
      </p>
    </div>
  );
}
