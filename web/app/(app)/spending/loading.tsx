import { PageSkeleton } from "@/components/skeleton";

export default function Loading() {
  return <PageSkeleton title="Ausgaben" cards={["h-48", "h-28", "h-40"]} />;
}
