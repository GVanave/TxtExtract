import { z } from "zod";

import { unauthorized } from "@/lib/auth";
import { receiptSchema } from "@/lib/receipt";
import { findDuplicate, getStore, StoreError } from "@/lib/store";
import { validateReceipt } from "@/lib/validation";

const saveRequest = z.object({
  receipt: receiptSchema,
  model: z.string().max(100).nullable().default(null),
  imageName: z.string().max(200).nullable().default(null),
  allowDuplicate: z.boolean().default(false),
});

function storeFailure(error: unknown) {
  if (error instanceof StoreError) return Response.json({ error: error.message }, { status: 502 });
  console.error("store failed", error);
  return Response.json({ error: "Could not reach the spreadsheet." }, { status: 500 });
}

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  try {
    return Response.json({ receipts: await getStore().list() });
  } catch (error) {
    return storeFailure(error);
  }
}

export async function POST(request: Request) {
  const denied = await unauthorized();
  if (denied) return denied;

  const body = saveRequest.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: `Invalid receipt: ${body.error.issues[0]?.path.join(".")} ${body.error.issues[0]?.message}` }, { status: 400 });
  }
  const { receipt, model, imageName, allowDuplicate } = body.data;
  if (!receipt.store_name.trim()) return Response.json({ error: "The store name is empty." }, { status: 400 });

  try {
    const store = getStore();
    if (!allowDuplicate) {
      const duplicate = findDuplicate(await store.list(), receipt);
      if (duplicate) return Response.json({ error: "duplicate", duplicate }, { status: 409 });
    }
    // Checks are recomputed here rather than trusted from the browser.
    const saved = await store.save(receipt, { issues: validateReceipt(receipt), model, imageName });
    return Response.json({ saved }, { status: 201 });
  } catch (error) {
    return storeFailure(error);
  }
}
