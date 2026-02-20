const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

function requiredEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function optionalEnv(key, fallback) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    return fallback;
  }
  return value.trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function runCommand(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${bin} command failed`).trim());
  }
  return result.stdout ? result.stdout.trim() : "";
}

function runAwsS3(args, region, endpoint) {
  const full = ["s3api", ...args, "--region", region, "--output", "json"];
  if (endpoint) {
    full.push("--endpoint-url", endpoint);
  }
  const output = runCommand("aws", full);
  return output ? JSON.parse(output) : {};
}

function runSqlite(dbPath, sql) {
  runCommand("sqlite3", [dbPath, sql]);
}

function backupWithVacuumInto(sourceDbPath, backupFilePath) {
  if (fs.existsSync(backupFilePath)) {
    fs.rmSync(backupFilePath, { force: true });
  }
  const escaped = backupFilePath.replace(/'/g, "''");
  runSqlite(sourceDbPath, `VACUUM INTO '${escaped}';`);
}

function sqliteIntegrityCheck(dbPath) {
  const output = runCommand("sqlite3", [dbPath, "PRAGMA integrity_check;"]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function assertSqliteIntegrityOk(dbPath) {
  const lines = sqliteIntegrityCheck(dbPath);
  if (lines.length !== 1 || lines[0] !== "ok") {
    throw new Error(`SQLite integrity check failed for ${dbPath}: ${lines.join("; ")}`);
  }
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function timestampParts(now) {
  const iso = now.toISOString();
  const compact = iso.replace(/[-:.]/g, "").replace("T", "_").replace("Z", "");
  return {
    iso,
    compact,
    year: iso.slice(0, 4),
    month: iso.slice(5, 7),
    day: iso.slice(8, 10),
  };
}

function parseArgv(argv) {
  const options = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
    } else {
      options[key] = next;
      i += 1;
    }
  }
  return options;
}

function resolveBackupMode() {
  return optionalEnv("BACKUP_DESTINATION_MODE", "s3").toLowerCase() === "local"
    ? "local"
    : "s3";
}

function makeTempFilePath(prefix, extension) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${crypto.randomUUID()}${extension}`);
}

module.exports = {
  requiredEnv,
  optionalEnv,
  ensureDir,
  runCommand,
  runAwsS3,
  runSqlite,
  backupWithVacuumInto,
  sqliteIntegrityCheck,
  assertSqliteIntegrityOk,
  sha256File,
  timestampParts,
  parseArgv,
  resolveBackupMode,
  makeTempFilePath,
};
