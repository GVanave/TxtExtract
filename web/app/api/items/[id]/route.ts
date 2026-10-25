import { z } from "zod";

import { databaseFailure, requireSession } from "@/lib/api";
import { CATEGORY_SLUGS } from "@/lib/categories";

const body = z.object({ category: z.enum(CATEGORY_SLUGS).nullable() });

/** Change a product line's category; the choice is remembered for next time. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/items/[id]">) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown category." }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const ok = await session.store.setItemCategory(session.userId, id, parsed.data.category);
    return ok ? new Response(null, { status: 204 }) : Response.json({ error: "Line not found." }, { status: 404 });
  } catch (error) {
    return databaseFailure(error);
  }
}
