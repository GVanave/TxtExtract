import { requireSession } from "@/lib/api";
import { getExtractor } from "@/lib/extractor";
import { ExtractionError, friendlyExtractionError } from "@/lib/gemini";
import { logError } from "@/lib/log";

// Gemini plus up to three retries on "busy" can take a while.
export const maxDuration = 60;

// Vercel rejects request bodies over 4.5 MB; the browser shrinks photos well below this before upload.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"]);

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const form = await request.formData().catch(() => null);
  const file = form?.get("image");
  if (!(file instanceof File)) return Response.json({ error: "Es wurde kein Foto hochgeladen." }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return Response.json({ error: "Diese Datei kann nicht gelesen werden. Bitte nimm ein Foto (JPG, PNG, HEIC) oder ein PDF." }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Die Datei ist zu groß (mehr als 4 MB). Bitte mach das Foto noch einmal." }, { status: 413 });
  }

  let result;
  try {
    result = await getExtractor().extract(Buffer.from(await file.arrayBuffer()), file.type);
  } catch (error) {
    logError("extract failed", error); // technical details for the owner; the user gets a plain sentence
    if (error instanceof ExtractionError) return Response.json({ error: friendlyExtractionError(error) }, { status: 422 });
    return Response.json({ error: "Beim Lesen ist etwas schiefgegangen. Bitte versuche es noch einmal." }, { status: 500 });
  }

  // Your earlier category corrections replace Gemini's guesses. If the database is unreachable, keep the guesses.
  try {
    result = { ...result, receipt: await session.store.applyMemory(session.userId, result.receipt) };
  } catch (error) {
    logError("applying category memory failed", error);
  }
  return Response.json(result);
}
