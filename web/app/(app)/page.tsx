import { ScanFlow } from "@/components/scan-flow";
import { PageHeader } from "@/components/ui";

export default function ScanPage() {
  return (
    <>
      <PageHeader title="Scan a receipt" subtitle="Snap it, check it, and it's added to your Google Sheet." />
      <ScanFlow />
    </>
  );
}
