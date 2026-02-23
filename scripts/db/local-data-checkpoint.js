const fs = require("fs");
const path = require("path");
const { parseDatabaseUrl, runSql } = require("./lib");

function resolveDatabasePath() {
  const databaseUrl = process.env.DATABASE_URL || "file:./data/prostyle.local.db";
  return parseDatabaseUrl(databaseUrl);
}

function tableExists(dbPath, tableName) {
  const output = runSql(
    dbPath,
    `SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '${String(tableName).replace(/'/g, "''")}';`
  ).trim();
  return Number(output || 0) > 0;
}

function tableCount(dbPath, tableName) {
  if (!tableExists(dbPath, tableName)) {
    return null;
  }
  const output = runSql(dbPath, `SELECT COUNT(*) AS count FROM ${tableName};`).trim();
  return Number(output || 0);
}

function makeTimestamp() {
  const iso = new Date().toISOString();
  return iso.replace(/[-:]/g, "").replace("T", "-").replace(/\..+$/, "Z");
}

function main() {
  const dbPath = resolveDatabasePath();
  if (!fs.existsSync(dbPath)) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          skipped: true,
          reason: "Database file does not exist",
          databasePath: dbPath,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const checkpointsDir = path.join(path.dirname(dbPath), "checkpoints");
  fs.mkdirSync(checkpointsDir, { recursive: true });

  const timestamp = makeTimestamp();
  const baseName = `${path.basename(dbPath, path.extname(dbPath))}.checkpoint.${timestamp}`;
  const snapshotPath = path.join(checkpointsDir, `${baseName}${path.extname(dbPath) || ".sqlite3"}`);
  const metadataPath = path.join(checkpointsDir, `${baseName}.json`);

  fs.copyFileSync(dbPath, snapshotPath);

  const trackedTables = [
    "baseline_render_sets",
    "baseline_render_set_items",
    "style_dna_images",
    "style_dna_runs",
    "style_dna_run_results",
  ];

  const counts = {};
  for (const tableName of trackedTables) {
    counts[tableName] = tableCount(dbPath, tableName);
  }

  const metadata = {
    ok: true,
    createdAt: new Date().toISOString(),
    databasePath: dbPath,
    snapshotPath,
    snapshotBytes: fs.statSync(snapshotPath).size,
    trackedCounts: counts,
    restoreHint: `cp ${JSON.stringify(snapshotPath)} ${JSON.stringify(dbPath)}`,
  };

  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(metadata, null, 2));
}

main();
