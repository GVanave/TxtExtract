import { ExternalIcon } from "./icons";
import { button } from "./ui";

export function SheetLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={button.secondary}>
      <ExternalIcon size={16} /> Open Google Sheet
    </a>
  );
}
