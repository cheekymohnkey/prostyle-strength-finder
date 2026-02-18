const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");
const REPO_ROOT = path.resolve(__dirname, "../..");

function parseDatabaseUrl(databaseUrl) {
  if (!databaseUrl || typeof databaseUrl !== "string") {
    throw new Error("DATABASE_URL is required");
  }

  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Only SQLite file DATABASE_URL is supported, got: ${databaseUrl}`);
  }

  if (databaseUrl.startsWith("file://")) {
    const parsedUrl = new URL(databaseUrl);
    return decodeURIComponent(parsedUrl.pathname);
  }

  const value = databaseUrl.slice("file:".length);
  if (!value) {
    throw new Error("DATABASE_URL file path is empty");
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(REPO_ROOT, value);
}

function ensureDbParentDir(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

function runSql(dbPath, sql, options = {}) {
  const args = [];
  if (options.json) {
    args.push("-json");
  }
  args.push(dbPath, sql);

  const result = spawnSync("sqlite3", args, {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "sqlite3 command failed").trim());
  }

  return result.stdout.trim();
}

function ensureMigrationsTable(dbPath) {
  runSql(
    dbPath,
    `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    `
  );
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function getAppliedMigrations(dbPath) {
  const output = runSql(
    dbPath,
    "SELECT name, applied_at FROM schema_migrations ORDER BY name ASC;",
    { json: true }
  );

  if (!output) {
    return [];
  }

  return JSON.parse(output);
}

function parseMigrationSql(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const upMarker = "-- migrate:up";
  const downMarker = "-- migrate:down";

  const upStart = raw.indexOf(upMarker);
  if (upStart < 0) {
    throw new Error(`Migration missing required marker ${upMarker}: ${filePath}`);
  }

  const downStart = raw.indexOf(downMarker);
  if (downStart < 0) {
    return {
      up: raw.slice(upStart + upMarker.length).trim(),
      down: null,
    };
  }

  return {
    up: raw.slice(upStart + upMarker.length, downStart).trim(),
    down: raw.slice(downStart + downMarker.length).trim() || null,
  };
}

function applyMigration(dbPath, migrationName) {
  const filePath = path.join(MIGRATIONS_DIR, migrationName);
  const parsed = parseMigrationSql(filePath);
  if (!parsed.up) {
    throw new Error(`Migration has empty up section: ${migrationName}`);
  }

  const escapedName = migrationName.replace(/'/g, "''");
  runSql(
    dbPath,
    `
    BEGIN;
    ${parsed.up}
    INSERT INTO schema_migrations (name) VALUES ('${escapedName}');
    COMMIT;
    `
  );
}

function rollbackMigration(dbPath, migrationName) {
  const filePath = path.join(MIGRATIONS_DIR, migrationName);
  const parsed = parseMigrationSql(filePath);
  if (!parsed.down) {
    throw new Error(`Migration has no down section: ${migrationName}`);
  }

  const escapedName = migrationName.replace(/'/g, "''");
  runSql(
    dbPath,
    `
    BEGIN;
    ${parsed.down}
    DELETE FROM schema_migrations WHERE name = '${escapedName}';
    COMMIT;
    `
  );
}

function getPendingMigrations(dbPath) {
  const files = listMigrationFiles();
  const appliedNames = new Set(getAppliedMigrations(dbPath).map((item) => item.name));
  return files.filter((name) => !appliedNames.has(name));
}

module.exports = {
  MIGRATIONS_DIR,
  parseDatabaseUrl,
  ensureDbParentDir,
  runSql,
  ensureMigrationsTable,
  listMigrationFiles,
  getAppliedMigrations,
  parseMigrationSql,
  applyMigration,
  rollbackMigration,
  getPendingMigrations,
};
