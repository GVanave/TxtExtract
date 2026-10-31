import "server-only";

import { currentUser } from "./auth";
import { getStore, type ReceiptStore, StoreError } from "./db/store";
import { logError } from "./log";

export type Session = { userId: string; store: ReceiptStore };

/** The signed-in user's id and the store, or a ready-made error response. */
export async function requireSession(): Promise<Session | Response> {
  const email = await currentUser();
  if (!email) return Response.json({ error: "Bitte melde dich an." }, { status: 401 });
  try {
    const store = getStore();
    return { userId: await store.userId(email), store };
  } catch (error) {
    return databaseFailure(error);
  }
}

export function databaseFailure(error: unknown): Response {
  logError("database request failed", error);
  if (error instanceof StoreError) return Response.json({ error: error.message }, { status: 503 });
  return Response.json({ error: "Die Daten konnten gerade nicht geladen oder gespeichert werden. Bitte versuche es noch einmal." }, { status: 500 });
}
