import { databaseFailure, requireSession } from "@/lib/api";

/** Deletes at once and returns what was deleted, so the app can offer "Rückgängig" instead of asking first. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/receipts/[id]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    const deleted = await session.store.deleteWithSnapshot(session.userId, id);
    return deleted ? Response.json({ deleted }) : Response.json({ error: "Einkauf nicht gefunden." }, { status: 404 });
  } catch (error) {
    return databaseFailure(error);
  }
}
