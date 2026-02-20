const fs = require("fs");
const path = require("path");
const {
  parseDatabaseUrl,
} = require("../db/lib");
const {
  requiredEnv,
  optionalEnv,
  ensureDir,
  runAwsS3,
  backupWithVacuumInto,
  assertSqliteIntegrityOk,
  sha256File,
  timestampParts,
  resolveBackupMode,
  makeTempFilePath,
} = require("./lib");

function main() {
  const mode = resolveBackupMode();
  const databaseUrl = requiredEnv("DATABASE_URL");
  const dbPath = parseDatabaseUrl(databaseUrl);
  const appEnv = optionalEnv("APP_ENV", "unknown");
  const now = new Date();
  const ts = timestampParts(now);
  const backupFileName = `prostyle-${appEnv}-${ts.compact}.sqlite3`;
  const tempBackupPath = makeTempFilePath("prostyle-db-backup", ".sqlite3");

  backupWithVacuumInto(dbPath, tempBackupPath);
  if (!fs.existsSync(tempBackupPath)) {
    throw new Error(`Backup file was not created: ${tempBackupPath}`);
  }

  const sizeBytes = fs.statSync(tempBackupPath).size;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error(`Backup file is empty: ${tempBackupPath}`);
  }

  assertSqliteIntegrityOk(tempBackupPath);
  const checksumSha256 = sha256File(tempBackupPath);

  let destination = null;

  if (mode === "s3") {
    const bucket = requiredEnv("S3_BUCKET");
    const region = requiredEnv("AWS_REGION");
    const endpoint = optionalEnv("S3_ENDPOINT_OVERRIDE", "");
    const prefix = optionalEnv("BACKUP_S3_PREFIX", "db-backups");
    const key = `${prefix}/${ts.year}/${ts.month}/${ts.day}/${backupFileName}`;

    runAwsS3(
      [
        "put-object",
        "--bucket",
        bucket,
        "--key",
        key,
        "--body",
        tempBackupPath,
        "--server-side-encryption",
        "AES256",
        "--metadata",
        `source_db=${path.basename(dbPath)},created_at=${ts.iso},sha256=${checksumSha256}`,
      ],
      region,
      endpoint || null
    );
    const head = runAwsS3(
      [
        "head-object",
        "--bucket",
        bucket,
        "--key",
        key,
      ],
      region,
      endpoint || null
    );
    if (Number(head.ContentLength || 0) <= 0) {
      throw new Error(`Uploaded backup appears empty: s3://${bucket}/${key}`);
    }

    destination = {
      mode,
      bucket,
      key,
      storageUri: `s3://${bucket}/${key}`,
      contentLength: Number(head.ContentLength || 0),
      metadata: head.Metadata || {},
    };
  } else {
    const localRoot = path.resolve(optionalEnv("BACKUP_LOCAL_DIR", "./data/db-backups"));
    const localDir = path.join(localRoot, ts.year, ts.month, ts.day);
    ensureDir(localDir);
    const localPath = path.join(localDir, backupFileName);
    fs.copyFileSync(tempBackupPath, localPath);
    const copiedSize = fs.statSync(localPath).size;
    if (copiedSize <= 0) {
      throw new Error(`Copied backup appears empty: ${localPath}`);
    }
    destination = {
      mode,
      localPath,
      contentLength: copiedSize,
    };
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        createdAt: ts.iso,
        sourceDbPath: dbPath,
        backupFileName,
        tempBackupPath,
        sizeBytes,
        checksumSha256,
        destination,
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
