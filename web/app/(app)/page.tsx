import { ScanFlow } from "@/components/scan-flow";
import { PageHeader } from "@/components/ui";

export default function ScanPage() {
  return (
    <>
      <PageHeader title="Kassenbon scannen" subtitle="Foto machen, kurz prüfen, speichern." />
      <ScanFlow />
    </>
  );
}
