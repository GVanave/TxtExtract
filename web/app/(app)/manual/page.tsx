import type { Metadata } from "next";

import { ManualEntryForm } from "@/components/manual-entry";
import { PageHeader } from "@/components/ui";
import { todayIso } from "@/lib/dates";
import { dayLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Ohne Kassenbon eintragen" };

export default async function ManualPage() {
  // Rendered per request so "heute" is really today (the server sets the same date when saving).
  const today = todayIso();
  return (
    <>
      <PageHeader title="Ohne Kassenbon eintragen" subtitle="Betrag eintippen und speichern. Ganz ohne Foto." />
      <ManualEntryForm todayLabel={dayLabel(today)} />
    </>
  );
}

export const dynamic = "force-dynamic";
