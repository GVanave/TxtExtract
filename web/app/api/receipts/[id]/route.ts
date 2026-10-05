import { unauthorized } from "@/lib/auth";
import { getStore, StoreError } from "@/lib/store";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/receipts/[id]">) {
  const denied = await unauthorized();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const deleted = await getStore().delete(id);
    return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Receipt not found." }, { status: 404 });
  } catch (error) {
    const message = error instanceof StoreError ? error.message : "Could not reach the spreadsheet.";
    return Response.json({ error: message }, { status: 502 });
  }
}
