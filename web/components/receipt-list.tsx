import Link from "next/link";

import { euro, germanDate } from "@/lib/format";
import type { SavedReceipt } from "@/lib/receipt";

import { ChevronIcon } from "./icons";
import { ReviewBadge } from "./ui";

export function ReceiptList({ receipts }: { receipts: SavedReceipt[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {receipts.map((r) => (
        <li key={r.id}>
          <Link href={`/receipts/${r.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-2">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-bold text-brand-strong">
              {r.store_name.trim().slice(0, 2).toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.store_name}</p>
              <p className="text-xs text-muted">
                {germanDate(r.date)}
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
  );
}
