import fs from "node:fs";
import path from "node:path";

if (process.env.DATABASE_URL) {
  console.error("db:reset only wipes the embedded dev database. Refusing because DATABASE_URL is set.");
  process.exit(1);
}
fs.rmSync(path.join(process.cwd(), ".data", "pgdata"), { recursive: true, force: true });
console.log("dev database wiped");
