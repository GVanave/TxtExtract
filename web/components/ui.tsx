import type { ReactNode } from "react";

import { AlertIcon, CheckIcon } from "./icons";

export const button = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-on-brand shadow-sm transition hover:bg-brand-strong active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:bg-surface-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
  ghost:
    "inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-danger px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50",
};

export const input =
  "w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-ink outline-none transition placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/25";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Notice({ tone, title, children }: { tone: "ok" | "warn" | "danger"; title: string; children?: ReactNode }) {
  const styles = {
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  }[tone];
  return (
    <div role={tone === "ok" ? "status" : "alert"} className={`flex gap-3 rounded-xl p-3.5 text-sm ${styles}`}>
      <span className="mt-0.5 shrink-0">{tone === "ok" ? <CheckIcon size={18} /> : <AlertIcon size={18} />}</span>
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-1 text-ink/80">{children}</div>}
      </div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function ReviewBadge({ needsReview }: { needsReview: boolean }) {
  return needsReview ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">
      <AlertIcon size={12} /> Review
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-xs font-semibold text-ok">
      <CheckIcon size={12} /> Checked
    </span>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="mb-3 rounded-2xl bg-brand-soft p-3 text-brand">{icon}</div>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}
