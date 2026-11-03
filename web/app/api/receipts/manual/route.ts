import { databaseFailure, requireSession } from "@/lib/api";
import { MANUAL_MODEL, manualEntrySchema, manualReceipt } from "@/lib/manual";

/** Saves a purchase entered by hand (no photo, no Gemini). The date is today, set here and not by the browser. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = manualEntrySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    const field = body.error.issues[0]?.path[0];
    const error = field === "amount" ? "Bitte trage einen gültigen Betrag ein (zum Beispiel 12,49)." : "Bitte prüfe deine Angaben.";
    return Response.json({ error }, { status: 400 });
  }

  try {
    const saved = await session.store.save(session.userId, manualReceipt(body.data), { issues: [], model: MANUAL_MODEL, imageName: null });
    return Response.json({ saved }, { status: 201 });
  } catch (error) {
    return databaseFailure(error);
  }
}
