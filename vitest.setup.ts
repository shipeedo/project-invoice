// Point every test run at a throwaway in-memory SQLite and apply the drizzle
// migrations, so DB-backed tests are hermetic and don't depend on a local
// dev.db (which doesn't exist in CI). Runs before each test file.
//
// The env var must be set before "@/lib/db" is first evaluated, so the db
// module is pulled in via dynamic import after the assignment rather than a
// hoisted top-level import.
process.env.DATABASE_URL = "file::memory:";

const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const { db } = await import("@/lib/db");

migrate(db, { migrationsFolder: "./drizzle" });

export {};
