import { z } from "zod";

import { databaseFailure, requireSession } from "@/lib/api";
import { savedReceiptSchema } from "@/lib/receipt";

const body = z.object({ receipt: savedReceiptSchema, rawExtraction: z.unknown().optional() });

/** Undo of a delete: puts the receipt back exactly as it was. */
export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !parsed.data.receipt.date) return Response.json({ error: "Der Einkauf kann nicht wiederhergestellt werden." }, { status: 400 });
  if (JSON.stringify(parsed.data.rawExtraction ?? null).length > 200_000) return Response.json({ error: "Die Daten sind zu groß." }, { status: 413 });
  try {
    const restored = await session.store.restore(session.userId, { receipt: parsed.data.receipt, rawExtraction: parsed.data.rawExtraction ?? null });
    return restored
      ? Response.json({ restored }, { status: 201 })
      : Response.json({ error: "Der Einkauf ist schon wieder da oder kann nicht wiederhergestellt werden." }, { status: 409 });
  } catch (error) {
    return databaseFailure(error);
  }
}
