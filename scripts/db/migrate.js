const fs = require("fs");
const path = require("path");
const {
  MIGRATIONS_DIR,
  parseDatabaseUrl,
  ensureDbParentDir,
  ensureMigrationsTable,
  listMigrationFiles,
  getAppliedMigrations,
  applyMigration,
  rollbackMigration,
  getPendingMigrations,
} = require("./lib");

function loadDatabasePath() {
  return parseDatabaseUrl(process.env.DATABASE_URL);
}

function commandStatus() {
  const dbPath = loadDatabasePath();
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);

  const files = listMigrationFiles();
  const applied = getAppliedMigrations(dbPath);
  const appliedSet = new Set(applied.map((item) => item.name));
  const pending = files.filter((file) => !appliedSet.has(file));

  console.log(
    JSON.stringify(
      {
        databasePath: dbPath,
        migrationDir: MIGRATIONS_DIR,
        totalMigrations: files.length,
        appliedMigrations: applied.length,
        pendingMigrations: pending.length,
        pending,
      },
      null,
      2
    )
  );
}

function commandApply() {
  const dbPath = loadDatabasePath();
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);

  const pending = getPendingMigrations(dbPath);
  for (const migrationName of pending) {
    applyMigration(dbPath, migrationName);
  }

  console.log(
    JSON.stringify(
      {
        databasePath: dbPath,
        appliedNow: pending.length,
        appliedMigrations: pending,
      },
      null,
      2
    )
  );
}

function commandCreate(name) {
  if (!name) {
    throw new Error("Migration name is required. Example: npm run db:create -- add_users_table");
  }

  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  const cleanName = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const fileName = `${timestamp}_${cleanName}.sql`;
  const filePath = path.join(MIGRATIONS_DIR, fileName);
  const template = `-- migrate:up

-- Write forward migration SQL here.

-- migrate:down

-- Write rollback SQL here.
`;
  fs.writeFileSync(filePath, template);

  console.log(
    JSON.stringify(
      {
        created: filePath,
      },
      null,
      2
    )
  );
}

function commandRollback() {
  const dbPath = loadDatabasePath();
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);

  const applied = getAppliedMigrations(dbPath);
  const last = applied[applied.length - 1];
  if (!last) {
    console.log(JSON.stringify({ databasePath: dbPath, rolledBack: null, message: "No migrations applied" }, null, 2));
    return;
  }

  rollbackMigration(dbPath, last.name);
  console.log(JSON.stringify({ databasePath: dbPath, rolledBack: last.name }, null, 2));
}

function commandReset() {
  const dbPath = loadDatabasePath();
  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
  }
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const pending = getPendingMigrations(dbPath);
  for (const migrationName of pending) {
    applyMigration(dbPath, migrationName);
  }

  console.log(
    JSON.stringify(
      {
        databasePath: dbPath,
        reset: true,
        appliedMigrations: pending,
      },
      null,
      2
    )
  );
}

function main() {
  const command = process.argv[2] || "apply";
  const arg = process.argv[3];

  switch (command) {
    case "apply":
      commandApply();
      return;
    case "status":
      commandStatus();
      return;
    case "create":
      commandCreate(arg);
      return;
    case "rollback":
      commandRollback();
      return;
    case "reset":
      commandReset();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main();
