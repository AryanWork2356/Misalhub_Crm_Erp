import { getDb } from "./index";

async function main() {
  const db = await getDb();
  const url = process.env.DATABASE_URL;
  if (url) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as never, { migrationsFolder: "./drizzle" });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db, { migrationsFolder: "./drizzle" });
  }
  console.log("migrations applied");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
