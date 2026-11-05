import { PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return <PageSkeleton title="Einkäufe" cards={["h-16", "h-16", "h-16", "h-16"]} />;
}
