import { z } from "zod";

import { databaseFailure, requireSession } from "@/lib/api";
import { receiptSchema } from "@/lib/receipt";
import { isValidIsoDate, validateReceipt } from "@/lib/validation";

const saveRequest = z.object({
  receipt: receiptSchema,
  model: z.string().max(100).nullable().default(null),
  imageName: z.string().max(200).nullable().default(null),
  rawExtraction: z.unknown().optional(),
  allowDuplicate: z.boolean().default(false),
});

export async function GET() {
  const session = await requireSession();
  if (session instanceof Response) return session;
  try {
    return Response.json({ receipts: await session.store.list(session.userId) });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function POST(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;

  const body = saveRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: `Invalid receipt: ${body.error.issues[0]?.path.join(".")} ${body.error.issues[0]?.message}` }, { status: 400 });
  }
  const { receipt, model, imageName, rawExtraction, allowDuplicate } = body.data;
  if (!receipt.store_name.trim()) return Response.json({ error: "The store name is empty." }, { status: 400 });
  if (!receipt.date || !isValidIsoDate(receipt.date)) return Response.json({ error: "The receipt needs a valid date." }, { status: 400 });
  if (rawExtraction !== undefined && JSON.stringify(rawExtraction).length > 200_000) {
    return Response.json({ error: "The extraction data is too large." }, { status: 413 });
  }

  try {
    if (!allowDuplicate) {
      const duplicate = await session.store.findDuplicate(session.userId, receipt);
      if (duplicate) return Response.json({ error: "duplicate", duplicate }, { status: 409 });
    }
    // Checks are recomputed here rather than trusted from the browser.
    const saved = await session.store.save(session.userId, receipt, { issues: validateReceipt(receipt), model, imageName, rawExtraction });
    return Response.json({ saved }, { status: 201 });
  } catch (error) {
    return databaseFailure(error);
  }
}
