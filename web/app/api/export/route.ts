import { databaseFailure, requireSession } from "@/lib/api";
import { isMonth } from "@/lib/dates";
import { receiptsWorkbook } from "@/lib/export";

/** GET /api/export (all receipts) or /api/export?month=2026-09 → an .xlsx download. */
export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof Response) return session;
  const month = new URL(request.url).searchParams.get("month");
  if (month !== null && !isMonth(month)) return Response.json({ error: "Use ?month=YYYY-MM." }, { status: 400 });

  try {
    const receipts = await session.store.list(session.userId, month ? { month } : {});
    const file = await receiptsWorkbook(receipts);
    const name = `kassenbon-${month ?? "all"}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return databaseFailure(error);
  }
}
