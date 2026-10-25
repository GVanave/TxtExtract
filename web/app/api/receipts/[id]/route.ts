import { databaseFailure, requireSession } from "@/lib/api";

export async function DELETE(_request: Request, ctx: RouteContext<"/api/receipts/[id]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  try {
    const deleted = await session.store.delete(session.userId, id);
    return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Receipt not found." }, { status: 404 });
  } catch (error) {
    return databaseFailure(error);
  }
}
