import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import type { PgliteDatabase } from "drizzle-orm/pglite";

export type DB = PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __db?: Promise<DB> };

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    // Serverless platforms spin up many instances: keep each one's pool small (use a pooled connection string).
    const pool = new Pool({ connectionString: url, max: process.env.VERCEL ? 3 : 10 });
    return drizzle(pool, { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = path.join(process.cwd(), ".data", "pgdata");
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  return drizzle(client, { schema });
}

/** Lazily-created singleton (survives Next.js dev hot reloads). */
export function getDb(): Promise<DB> {
  if (!g.__db) g.__db = create();
  return g.__db;
}
export { schema };
