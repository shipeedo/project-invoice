import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";

// Applies committed drizzle migrations on boot. Only for deployed
// environments (RUN_DB_MIGRATIONS=true): local dev databases are managed
// with `drizzle-kit push` and have no migrations journal, so running the
// migrator against them would fail on already-existing tables.
export function runMigrations() {
  const migrationsFolder = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(migrationsFolder)) {
    console.error(
      `[db] RUN_DB_MIGRATIONS is set but ${migrationsFolder} does not exist; skipping`,
    );
    return;
  }
  migrate(db, { migrationsFolder });
  console.log("[db] migrations applied");
}
