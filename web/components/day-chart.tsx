"use client";

import { useState } from "react";

import { dayLabel, euroFromCents as eur, monthName } from "@/lib/format";
import type { DayBar } from "@/lib/month-stats";

import { Card } from "./ui";

/**
 * Spending per day of the month as small bars: an overview of which days cost the most.
 * Tapping a bar shows that day's amount in the sentence below (phones have no hover).
 */
export function DayChart(props: { month: string; days: DayBar[]; top: string | null; shoppingDays: number; pastDays: number; running: boolean }) {
  const { days, top } = props;
  const [picked, setPicked] = useState<string | null>(null);
  const max = Math.max(...days.map((d) => d.cents), 1);
  const shown = days.find((d) => d.date === (picked ?? top)) ?? null;
  const labelDays = new Set([1, 5, 10, 15, 20, 25, days.length]);
  const shoppingDates = days.filter((d) => d.trips > 0).map((d) => d.date);
  const topDay = days.find((d) => d.date === top) ?? null;
  // Thin bars are hard to hit on a phone: the arrows step from one shopping day to the next.
  const step = (by: -1 | 1) => {
    const current = shown?.date ?? "";
    const next = by > 0 ? shoppingDates.find((d) => d > current) : shoppingDates.findLast((d) => d < current);
    if (next) setPicked(next);
  };
  const hasPrevious = shoppingDates.some((d) => d < (shown?.date ?? ""));
  const hasNext = shoppingDates.some((d) => d > (shown?.date ?? ""));

  return (
    <Card>
      <h2 className="text-lg font-semibold">Tag für Tag</h2>
      <p className="mb-3 text-sm text-muted">Tippe auf einen Balken, um den Betrag des Tages zu sehen.</p>

      <div className="flex h-36 items-end gap-[2px] sm:gap-1" role="group" aria-label={`Ausgaben pro Tag im ${monthName(props.month)}`}>
        {days.map((d) => {
                    const isShown = d.date === shown?.date;
          const empty = d.trips === 0;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setPicked(d.date)}
              aria-label={`${dayLabel(d.date)}: ${empty ? "kein Einkauf" : eur(d.cents)}`}
              aria-pressed={isShown}
              className="group flex h-full min-w-0 flex-1 items-end justify-center"
            >
              <span
                className={`block w-full rounded-t-[3px] transition ${
                  empty
                    ? d.future
                      ? "border-b-2 border-dashed border-line"
                      : "bg-line"
                    : isShown
                      ? "bg-brand ring-2 ring-brand/40 ring-offset-1"
                      : "bg-bar/40 group-hover:bg-bar/70"
                }`}
                style={{ height: empty ? 3 : `${Math.max((Math.max(d.cents, 0) / max) * 100, 4)}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex gap-[2px] sm:gap-1" aria-hidden="true">
        {days.map((d) => (
          <span key={d.date} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-xs text-muted">
            {labelDays.has(d.day) ? d.day : ""}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1 rounded-xl bg-surface-2 py-1 text-base">
        <button type="button" onClick={() => step(-1)} disabled={!hasPrevious} aria-label="Vorheriger Einkaufstag" className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-2xl font-bold text-brand disabled:text-line">
          ‹
        </button>
        <div className="min-w-0 flex-1 py-2" aria-live="polite">
        {shown && shown.trips > 0 ? (
          <p>
            <span className="font-semibold">{dayLabel(shown.date)}:</span> <span className="tabular font-semibold">{eur(shown.cents)}</span>
            {shown.trips > 1 ? ` bei ${shown.trips} Einkäufen` : ""}
            .
          </p>
        ) : shown ? (
          <p>
            <span className="font-semibold">{dayLabel(shown.date)}:</span> {shown.future ? "liegt noch in der Zukunft." : "kein Einkauf."}
          </p>
        ) : (
          <p className="text-muted">In diesem Monat gibt es keine Einkäufe.</p>
        )}
        </div>
        <button type="button" onClick={() => step(1)} disabled={!hasNext} aria-label="Nächster Einkaufstag" className="flex h-11 w-10 shrink-0 items-center justify-center rounded-lg text-2xl font-bold text-brand disabled:text-line">
          ›
        </button>
      </div>
      <p className="mt-2 text-sm text-muted">
        Eingekauft an {props.shoppingDays} von {props.running ? `${props.pastDays} Tagen bis heute` : `${days.length} Tagen`}.
        {topDay && (
          <>
            {" "}Am meisten: {dayLabel(topDay.date)} mit <span className="tabular font-semibold text-ink">{eur(topDay.cents)}</span>.
          </>
        )}
      </p>
    </Card>
  );
}
