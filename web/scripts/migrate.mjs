// Applies database migrations (./drizzle) before `next build`. Skips quietly when no database is configured,
// e.g. in CI or local builds, so the build still works.
import path from "node:path";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.log("db:migrate: no DATABASE_URL set, skipping migrations.");
  process.exit(0);
}

const { default: postgres } = await import("postgres");
const { drizzle } = await import("drizzle-orm/postgres-js");
const { migrate } = await import("drizzle-orm/postgres-js/migrator");

const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: path.join(import.meta.dirname, "..", "drizzle") });
  console.log("db:migrate: database is up to date.");
} finally {
  await client.end();
}
