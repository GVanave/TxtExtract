import "server-only";

import path from "node:path";

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import * as schema from "./schema";

/** Either driver: Postgres (Neon) in production, PGlite in development and tests. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export class StoreError extends Error {}

export const databaseUrl = () => process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

const cache = globalThis as unknown as { __kassenbonDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  cache.__kassenbonDb ??= createDb().catch((error) => {
    cache.__kassenbonDb = undefined; // try again on the next request
    throw error;
  });
  return cache.__kassenbonDb;
}

async function createDb(): Promise<Db> {
  const url = databaseUrl();
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare: false works with Neon's pooled (PgBouncer) connection string; few connections per serverless instance.
    const max = Number(process.env.DATABASE_POOL_MAX) || 3;
    const client = postgres(url, { prepare: false, max, idle_timeout: 20, onnotice: () => {} });
    return drizzle(client, { schema }) as unknown as Db;
  }
  if (process.env.NODE_ENV !== "production" && process.env.DATA_BACKEND === "pglite") {
    return createPgliteDb(process.env.PGLITE_DIR || undefined);
  }
  throw new StoreError("The database is not configured. Set DATABASE_URL (Vercel → Storage → Neon Postgres).");
}

/** A Postgres that runs inside this process (in memory, or in `dir`), with all migrations applied. */
export async function createPgliteDb(dir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dir), { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  return db as unknown as Db;
}
