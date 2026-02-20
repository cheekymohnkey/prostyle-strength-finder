const path = require("path");
const { spawnSync } = require("child_process");
const { parseDatabaseUrl, runSql } = require("../db/lib");

function requiredEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function runNodeScript(scriptPath, args = [], env = process.env) {
  const result = spawnSync("node", [scriptPath, ...args], {
    encoding: "utf8",
    env,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${scriptPath} failed`).trim());
  }
  const output = (result.stdout || "").trim();
  if (!output) {
    throw new Error(`${scriptPath} produced no output`);
  }
  return JSON.parse(output);
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function quote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function querySingleValue(dbPath, sql) {
  const output = runSql(dbPath, sql, { json: true });
  const rows = output ? JSON.parse(output) : [];
  if (rows.length === 0) {
    return null;
  }
  const first = rows[0];
  const keys = Object.keys(first);
  return keys.length > 0 ? first[keys[0]] : null;
}

function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const dbPath = parseDatabaseUrl(databaseUrl);
  const markerTable = "backup_restore_smoke_marker";
  const beforeValue = `before-${Date.now()}`;
  const afterValue = `after-${Date.now()}`;

  runNodeScript(path.resolve("scripts/db/migrate.js"), ["reset"], process.env);

  runSql(
    dbPath,
    `
    CREATE TABLE IF NOT EXISTS ${markerTable} (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      marker_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO ${markerTable} (id, marker_value, updated_at)
    VALUES (1, ${quote(beforeValue)}, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET marker_value = excluded.marker_value, updated_at = datetime('now');
    `
  );

  const localBackupDir = path.resolve("/tmp/prostyle-backup-smoke");
  const backupJson = runNodeScript(
    path.resolve("scripts/backup/create-and-upload.js"),
    [],
    {
      ...process.env,
      BACKUP_DESTINATION_MODE: "local",
      BACKUP_LOCAL_DIR: localBackupDir,
    }
  );
  assertCondition(backupJson.ok === true, "Backup script did not return ok=true");
  assertCondition(backupJson.destination && backupJson.destination.localPath, "Backup script missing localPath");

  runSql(
    dbPath,
    `
    UPDATE ${markerTable}
    SET marker_value = ${quote(afterValue)}, updated_at = datetime('now')
    WHERE id = 1;
    `
  );

  const valueBeforeRestore = querySingleValue(
    dbPath,
    `SELECT marker_value FROM ${markerTable} WHERE id = 1;`
  );
  assertCondition(valueBeforeRestore === afterValue, "Expected marker update to after-value before restore");

  const restoreJson = runNodeScript(
    path.resolve("scripts/backup/restore.js"),
    ["--from-file", backupJson.destination.localPath],
    {
      ...process.env,
      BACKUP_DESTINATION_MODE: "local",
    }
  );
  assertCondition(restoreJson.ok === true, "Restore script did not return ok=true");

  const valueAfterRestore = querySingleValue(
    dbPath,
    `SELECT marker_value FROM ${markerTable} WHERE id = 1;`
  );
  assertCondition(valueAfterRestore === beforeValue, "Expected restored marker value to match pre-backup value");

  console.log(
    JSON.stringify(
      {
        ok: true,
        dbPath,
        backupLocalPath: backupJson.destination.localPath,
        markerBeforeBackup: beforeValue,
        markerAfterMutation: afterValue,
        markerAfterRestore: valueAfterRestore,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
