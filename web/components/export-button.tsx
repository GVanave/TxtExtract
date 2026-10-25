import { DownloadIcon } from "./icons";
import { button } from "./ui";

/** Downloads all receipts (or one month) as an Excel file. */
export function ExportButton({ month, label = "Export to Excel" }: { month?: string; label?: string }) {
  return (
    <a href={month ? `/api/export?month=${month}` : "/api/export"} className={button.secondary} download>
      <DownloadIcon size={16} /> {label}
    </a>
  );
}
