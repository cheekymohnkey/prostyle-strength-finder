const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const {
  ensureDbParentDir,
  ensureMigrationsTable,
  listMigrationFiles,
  applyMigration,
} = require("../db/lib");

function resolveArgs(argv) {
  const args = {
    storagePolicyMode: "isolated",
    help: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--storage-policy-mode" && index + 1 < argv.length) {
      args.storagePolicyMode = String(argv[index + 1] || "").trim().toLowerCase();
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  if (args.storagePolicyMode !== "isolated" && args.storagePolicyMode !== "shared") {
    throw new Error(
      `Invalid --storage-policy-mode: ${args.storagePolicyMode}. Expected isolated or shared`
    );
  }
  return args;
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts-upload-smoke.js [--storage-policy-mode isolated|shared]",
      "",
      "Behavior:",
      "  isolated (default): validates local and storage-adapter paths using local disk storage fixture.",
      "  shared: validates storage-adapter path using current process env contract (APP_ENV/S3_BUCKET/AWS_REGION).",
    ].join("\n")
  );
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function createTempDbPath() {
  return path.join(os.tmpdir(), `style-dna-taxonomy-rollout-upload-smoke-${Date.now()}-${crypto.randomUUID()}.sqlite3`);
}

function applyAllMigrations(dbPath) {
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  const migrationFiles = listMigrationFiles();
  migrationFiles.forEach((name) => applyMigration(dbPath, name));
}

function runNodeScript({ dbPath, scriptPath, args, envOverrides }) {
  const result = spawnSync("node", [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
      ...(envOverrides || {}),
    },
  });
  const stdout = String(result.stdout || "").trim();
  const json = (() => {
    try {
      return stdout ? JSON.parse(stdout) : null;
    } catch (_error) {
      return null;
    }
  })();
  return {
    status: result.status,
    stdout,
    stderr: String(result.stderr || "").trim(),
    json,
  };
}

function requiredSharedEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable for shared storage mode: ${key}`);
  }
  return value.trim();
}

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }

  const dbPath = createTempDbPath();
  const artifactDir = path.join(os.tmpdir(), `style-dna-rollout-upload-src-${Date.now()}-${crypto.randomUUID()}`);
  const exportDir = path.join(os.tmpdir(), `style-dna-rollout-upload-export-${Date.now()}-${crypto.randomUUID()}`);
  const uploadDir = path.join(os.tmpdir(), `style-dna-rollout-upload-dst-${Date.now()}-${crypto.randomUUID()}`);
  const storageLocalDir = path.join(os.tmpdir(), `style-dna-rollout-upload-storage-${Date.now()}-${crypto.randomUUID()}`);
  const seedV2 = path.resolve(process.cwd(), "scripts/style-dna/seeds/style-dna-taxonomy-seed-v2.json");
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.mkdirSync(exportDir, { recursive: true });
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.mkdirSync(storageLocalDir, { recursive: true });

  try {
    if (args.storagePolicyMode === "shared") {
      requiredSharedEnv("APP_ENV");
      requiredSharedEnv("S3_BUCKET");
      requiredSharedEnv("AWS_REGION");
    }
    applyAllMigrations(dbPath);

    const rolloutScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts.js";
    const exportScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts-export.js";
    const uploadScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts-upload.js";
    const publishScript = "scripts/style-dna/taxonomy-seed-rollout-artifacts-publish.js";
    const runId = "smoke_upload_run";

    const rollout = runNodeScript({
      dbPath,
      scriptPath: rolloutScript,
      args: [
        "--file",
        seedV2,
        "--artifact-dir",
        artifactDir,
        "--run-id",
        runId,
        "--min-canonical",
        "4",
        "--min-aliases",
        "16",
      ],
    });
    assertCondition(rollout.status === 0, "Expected rollout generation success");

    const exported = runNodeScript({
      dbPath,
      scriptPath: exportScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--destination-dir",
        exportDir,
        "--run-id",
        runId,
      ],
    });
    assertCondition(exported.status === 0, "Expected export success");
    const manifestPath = String(exported.json?.manifestPath || "");
    assertCondition(manifestPath !== "" && fs.existsSync(manifestPath), "Expected export manifest path");

    const uploadFirst = runNodeScript({
      dbPath,
      scriptPath: uploadScript,
      args: [
        "--manifest-path",
        manifestPath,
        "--upload-dir",
        uploadDir,
      ],
    });
    assertCondition(uploadFirst.status === 0, "Expected first upload success");
    assertCondition(uploadFirst.json?.ok === true, "Expected first upload ok=true");
    assertCondition(
      typeof uploadFirst.json?.manifestSha256 === "string" && uploadFirst.json.manifestSha256.length === 64,
      "Expected manifestSha256 hash in receipt"
    );
    assertCondition(
      typeof uploadFirst.json?.receiptId === "string" && uploadFirst.json.receiptId.length === 64,
      "Expected deterministic receiptId hash"
    );

    const uploadSecond = runNodeScript({
      dbPath,
      scriptPath: uploadScript,
      args: [
        "--manifest-path",
        manifestPath,
        "--upload-dir",
        uploadDir,
      ],
    });
    assertCondition(uploadSecond.status === 0, "Expected second upload success");
    assertCondition(
      uploadSecond.json?.receiptId === uploadFirst.json?.receiptId,
      "Expected repeated upload receiptId to remain deterministic for same manifest/files"
    );

    const uploadLocalMissingDir = runNodeScript({
      dbPath,
      scriptPath: uploadScript,
      args: [
        "--manifest-path",
        manifestPath,
        "--destination-policy",
        "local",
      ],
    });
    assertCondition(uploadLocalMissingDir.status !== 0, "Expected local policy failure without upload-dir");
    assertCondition(uploadLocalMissingDir.json?.ok === false, "Expected local policy failure ok=false");
    assertCondition(
      String(uploadLocalMissingDir.json?.reason || "") === "invalid_config",
      `Expected invalid_config reason, got ${JSON.stringify(uploadLocalMissingDir.json)}`
    );

    const storagePrefix = args.storagePolicyMode === "shared"
      ? `uploads/style-dna/taxonomy-rollouts-shared-smoke/${Date.now()}-${crypto.randomUUID()}`
      : "uploads/style-dna/taxonomy-rollouts-smoke";
    const storageEnvOverrides = args.storagePolicyMode === "shared"
      ? {}
      : {
        APP_ENV: "local",
        S3_BUCKET: "style-dna-upload-smoke",
        AWS_REGION: "us-east-1",
        STORAGE_LOCAL_DIR: storageLocalDir,
      };
    const storageUploadFirst = runNodeScript({
      dbPath,
      scriptPath: uploadScript,
      args: [
        "--manifest-path",
        manifestPath,
        "--destination-policy",
        "storage-adapter",
        "--storage-prefix",
        storagePrefix,
      ],
      envOverrides: {
        ...storageEnvOverrides,
      },
    });
    assertCondition(storageUploadFirst.status === 0, "Expected storage-adapter upload success");
    assertCondition(storageUploadFirst.json?.ok === true, "Expected storage-adapter upload ok=true");
    assertCondition(
      storageUploadFirst.json?.destinationPolicy === "storage-adapter",
      "Expected storage-adapter destination policy in receipt"
    );
    assertCondition(
      Array.isArray(storageUploadFirst.json?.files)
      && storageUploadFirst.json.files.every((entry) => String(entry.storageKey || "").startsWith(`${storagePrefix}/${runId}/`)),
      `Expected storage keys under ${storagePrefix}/${runId}`
    );

    const storageUploadSecond = runNodeScript({
      dbPath,
      scriptPath: uploadScript,
      args: [
        "--manifest-path",
        manifestPath,
        "--destination-policy",
        "storage-adapter",
        "--storage-prefix",
        storagePrefix,
      ],
      envOverrides: {
        ...storageEnvOverrides,
      },
    });
    assertCondition(storageUploadSecond.status === 0, "Expected second storage-adapter upload success");
    assertCondition(
      storageUploadSecond.json?.receiptId === storageUploadFirst.json?.receiptId,
      "Expected deterministic receiptId for repeated storage-adapter upload"
    );

    const storageUploadWithUploadDir = runNodeScript({
      dbPath,
      scriptPath: uploadScript,
      args: [
        "--manifest-path",
        manifestPath,
        "--destination-policy",
        "storage-adapter",
        "--upload-dir",
        uploadDir,
      ],
      envOverrides: {
        ...storageEnvOverrides,
      },
    });
    assertCondition(storageUploadWithUploadDir.status !== 0, "Expected storage-adapter failure with upload-dir");
    assertCondition(storageUploadWithUploadDir.json?.ok === false, "Expected storage-adapter guardrail ok=false");
    assertCondition(
      String(storageUploadWithUploadDir.json?.reason || "") === "invalid_config",
      `Expected invalid_config guardrail reason, got ${JSON.stringify(storageUploadWithUploadDir.json)}`
    );

    const deletedSource = String(exported.json.files?.[0]?.destinationPath || "");
    assertCondition(deletedSource !== "" && fs.existsSync(deletedSource), "Expected deletable source file");
    fs.rmSync(deletedSource, { force: true });

    const uploadMissingSource = runNodeScript({
      dbPath,
      scriptPath: uploadScript,
      args: [
        "--manifest-path",
        manifestPath,
        "--upload-dir",
        uploadDir,
      ],
    });
    assertCondition(uploadMissingSource.status !== 0, "Expected upload failure for missing source file");
    assertCondition(uploadMissingSource.json?.ok === false, "Expected upload failure ok=false");
    assertCondition(
      String(uploadMissingSource.json?.reason || "") === "source_file_missing",
      `Expected source_file_missing reason, got ${JSON.stringify(uploadMissingSource.json)}`
    );

    const publish = runNodeScript({
      dbPath,
      scriptPath: publishScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--destination-dir",
        exportDir,
        "--run-id",
        runId,
      ],
    });
    assertCondition(publish.status === 0, "Expected publish wrapper success");
    assertCondition(publish.json?.ok === true, "Expected publish wrapper ok=true");
    assertCondition(
      typeof publish.json?.upload?.receiptId === "string" && publish.json.upload.receiptId.length === 64,
      "Expected publish output upload receiptId hash"
    );

    const publishStorage = runNodeScript({
      dbPath,
      scriptPath: publishScript,
      args: [
        "--artifact-dir",
        artifactDir,
        "--destination-dir",
        exportDir,
        "--run-id",
        runId,
        "--destination-policy",
        "storage-adapter",
        "--storage-prefix",
        storagePrefix,
      ],
      envOverrides: {
        ...storageEnvOverrides,
      },
    });
    assertCondition(publishStorage.status === 0, "Expected publish storage-adapter success");
    assertCondition(publishStorage.json?.ok === true, "Expected publish storage-adapter ok=true");
    assertCondition(
      String(publishStorage.json?.upload?.destinationPolicy || "") === "storage-adapter",
      "Expected publish storage-adapter destination policy"
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          runId,
          storagePolicyMode: args.storagePolicyMode,
          manifestPath,
          receiptId: uploadFirst.json.receiptId,
          uploadDir,
          storagePrefix,
        },
        null,
        2
      )
    );
  } finally {
    if (fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
    if (fs.existsSync(artifactDir)) {
      fs.rmSync(artifactDir, { recursive: true, force: true });
    }
    if (fs.existsSync(exportDir)) {
      fs.rmSync(exportDir, { recursive: true, force: true });
    }
    if (fs.existsSync(uploadDir)) {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
    if (fs.existsSync(storageLocalDir)) {
      fs.rmSync(storageLocalDir, { recursive: true, force: true });
    }
  }
}

main();
