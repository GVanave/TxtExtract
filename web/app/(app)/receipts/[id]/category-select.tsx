"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Spinner } from "@/components/icons";
import { CATEGORIES, type CategorySlug } from "@/lib/categories";

/** Change a saved line's category. The choice is remembered for the same product next time. */
export function CategorySelect({ itemId, value, label }: { itemId: string; value: CategorySlug | null; label: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(value ?? "");
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  async function change(next: string) {
    const previous = current;
    setCurrent(next);
    setError(false);
    const response = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: next || null }),
    });
    if (!response.ok) {
      setCurrent(previous);
      setError(true);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={current}
        aria-label={label}
        onChange={(e) => void change(e.target.value)}
        className={`max-w-44 rounded-md border bg-surface px-1.5 py-0.5 text-xs outline-none focus:border-brand ${error ? "border-danger" : "border-line"} ${current ? "text-ink" : "text-muted"}`}
      >
        <option value="">No category</option>
        {CATEGORIES.map((c) => (
          <option key={c.slug} value={c.slug}>
            {c.name}
          </option>
        ))}
      </select>
      {pending && <Spinner size={12} />}
      {error && <span className="text-xs text-danger">Not saved</span>}
    </span>
  );
}
