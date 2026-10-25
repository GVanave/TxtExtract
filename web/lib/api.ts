import "server-only";

import { currentUser } from "./auth";
import { getStore, type ReceiptStore, StoreError } from "./db/store";

export type Session = { userId: string; store: ReceiptStore };

/** The signed-in user's id and the store, or a ready-made error response. */
export async function requireSession(): Promise<Session | Response> {
  const email = await currentUser();
  if (!email) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const store = getStore();
    return { userId: await store.userId(email), store };
  } catch (error) {
    return databaseFailure(error);
  }
}

export function databaseFailure(error: unknown): Response {
  if (error instanceof StoreError) return Response.json({ error: error.message }, { status: 503 });
  console.error("database request failed", error);
  return Response.json({ error: "Could not reach the database. Please try again." }, { status: 500 });
}
