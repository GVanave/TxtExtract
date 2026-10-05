import { unauthorized } from "@/lib/auth";
import { getExtractor } from "@/lib/extractor";
import { ExtractionError } from "@/lib/gemini";

// Gemini plus up to three retries on "busy" can take a while.
export const maxDuration = 60;

// Vercel rejects request bodies over 4.5 MB; the browser shrinks photos well below this before upload.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return Response.json({ error: "No image uploaded." }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return Response.json({ error: `Unsupported file type '${file.type || "unknown"}'. Use a photo (JPG, PNG, WEBP, HEIC) or a PDF.` }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "The file is larger than 4 MB. Take the photo again or use a smaller PDF." }, { status: 413 });
  }

  try {
    const result = await getExtractor().extract(Buffer.from(await file.arrayBuffer()), file.type);
    return Response.json(result);
  } catch (error) {
    if (error instanceof ExtractionError) return Response.json({ error: error.message }, { status: 422 });
    console.error("extract failed", error);
    return Response.json({ error: "Something went wrong while reading the receipt." }, { status: 500 });
  }
}
