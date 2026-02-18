const fs = require("fs");
const {
  parseDatabaseUrl,
  ensureDbParentDir,
  ensureMigrationsTable,
  getPendingMigrations,
  runSql,
} = require("./lib");

function assertDatabaseReady(databaseUrl) {
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);

  runSql(dbPath, "SELECT 1;");

  const pending = getPendingMigrations(dbPath);
  if (pending.length > 0) {
    throw new Error(
      `Database has pending migrations (${pending.length}). Run: DATABASE_URL=${databaseUrl} node scripts/db/migrate.js apply`
    );
  }

  return {
    dbPath,
    exists: fs.existsSync(dbPath),
    pendingMigrations: 0,
  };
}

module.exports = {
  assertDatabaseReady,
};
