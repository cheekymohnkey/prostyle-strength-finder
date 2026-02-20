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
  runSqlite,
  assertSqliteIntegrityOk,
  parseArgv,
  resolveBackupMode,
  makeTempFilePath,
} = require("./lib");

function copyFileAtomic(sourcePath, targetPath) {
  const tempPath = `${targetPath}.tmp-${Date.now()}`;
  fs.copyFileSync(sourcePath, tempPath);
  fs.renameSync(tempPath, targetPath);
}

function main() {
  const args = parseArgv(process.argv);
  const mode = resolveBackupMode();
  const databaseUrl = args["target-db-url"] || requiredEnv("DATABASE_URL");
  const targetDbPath = parseDatabaseUrl(databaseUrl);
  ensureDir(path.dirname(targetDbPath));

  const downloadedPath = makeTempFilePath("prostyle-db-restore", ".sqlite3");

  if (mode === "s3") {
    const bucket = requiredEnv("S3_BUCKET");
    const region = requiredEnv("AWS_REGION");
    const endpoint = optionalEnv("S3_ENDPOINT_OVERRIDE", "");
    const key = args["s3-key"] || optionalEnv("BACKUP_RESTORE_S3_KEY", "");
    if (!key) {
      throw new Error("Restore requires --s3-key or BACKUP_RESTORE_S3_KEY when BACKUP_DESTINATION_MODE=s3");
    }
    runAwsS3(
      [
        "get-object",
        "--bucket",
        bucket,
        "--key",
        key,
        downloadedPath,
      ],
      region,
      endpoint || null
    );
  } else {
    const sourcePath = args["from-file"] || optionalEnv("BACKUP_RESTORE_LOCAL_PATH", "");
    if (!sourcePath) {
      throw new Error("Restore requires --from-file or BACKUP_RESTORE_LOCAL_PATH when BACKUP_DESTINATION_MODE=local");
    }
    const resolvedSourcePath = path.resolve(sourcePath);
    if (!fs.existsSync(resolvedSourcePath)) {
      throw new Error(`Restore source file not found: ${resolvedSourcePath}`);
    }
    fs.copyFileSync(resolvedSourcePath, downloadedPath);
  }

  if (!fs.existsSync(downloadedPath)) {
    throw new Error(`Restore source was not downloaded/copied: ${downloadedPath}`);
  }
  assertSqliteIntegrityOk(downloadedPath);

  let preRestoreSnapshotPath = null;
  if (fs.existsSync(targetDbPath)) {
    preRestoreSnapshotPath = `${targetDbPath}.pre-restore-${Date.now()}.sqlite3`;
    fs.copyFileSync(targetDbPath, preRestoreSnapshotPath);
  }

  copyFileAtomic(downloadedPath, targetDbPath);
  assertSqliteIntegrityOk(targetDbPath);

  runSqlite(targetDbPath, "SELECT COUNT(*) FROM schema_migrations;");

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        targetDbPath,
        restoreSourcePath: downloadedPath,
        preRestoreSnapshotPath,
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
