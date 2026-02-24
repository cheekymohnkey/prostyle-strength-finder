const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolvePath } = require("./taxonomy-seed-rollout-artifacts-lib");
const { createStorageAdapter } = require("../../packages/storage-adapter/src");

function resolveArgs(argv) {
  const args = {
    manifestPath: "",
    uploadDir: "",
    output: "",
    destinationPolicy: "",
    storagePrefix: "",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--manifest-path" && index + 1 < argv.length) {
      args.manifestPath = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--upload-dir" && index + 1 < argv.length) {
      args.uploadDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--output" && index + 1 < argv.length) {
      args.output = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--destination-policy" && index + 1 < argv.length) {
      args.destinationPolicy = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--storage-prefix" && index + 1 < argv.length) {
      args.storagePrefix = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function printHelp() {
  console.log(
    [
      "Usage:",
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts-upload.js --manifest-path <path> [--upload-dir <dir>] [--destination-policy <local|storage-adapter>] [--storage-prefix <prefix>] [--output <path>]",
      "",
      "Behavior:",
      "  local policy: copies all files listed in export manifest into upload dir under runId folder.",
      "  storage-adapter policy: uploads files to storage adapter keys under storage-prefix/runId/.",
      "  Both policies write deterministic upload receipts.",
    ].join("\n")
  );
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return sha256Buffer(buffer);
}

function resolveDestinationPolicy(args) {
  const cliValue = String(args.destinationPolicy || "").trim().toLowerCase();
  const envValue = String(process.env.STYLE_DNA_ROLLOUT_UPLOAD_DESTINATION_POLICY || "").trim().toLowerCase();
  const policy = cliValue || envValue || "local";
  if (policy !== "local" && policy !== "storage-adapter") {
    throw new Error(
      `Invalid destination policy: ${policy}. Expected one of: local, storage-adapter`
    );
  }
  return policy;
}

function resolveStoragePrefix(args) {
  const cliValue = String(args.storagePrefix || "").trim();
  const envValue = String(process.env.STYLE_DNA_ROLLOUT_UPLOAD_STORAGE_PREFIX || "").trim();
  const value = cliValue || envValue || "uploads/style-dna/taxonomy-rollouts";
  return value.replace(/\/+$/g, "");
}

function requiredEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function normalizeStorageKey(input) {
  return String(input || "")
    .trim()
    .replace(/^\/+/g, "")
    .replace(/\\/g, "/");
}

async function copyToLocalUploadDir(files, runUploadDir) {
  fs.mkdirSync(runUploadDir, { recursive: true });
  return files
    .map((entry) => {
      const fileName = String(entry.fileName || "").trim();
      const sourcePath = String(entry.destinationPath || "").trim();
      const targetPath = path.join(runUploadDir, fileName);
      fs.copyFileSync(sourcePath, targetPath);
      return {
        stage: String(entry.stage || "").trim(),
        fileName,
        sourcePath,
        targetPath,
        fileSha256: sha256File(targetPath),
      };
    })
    .sort((a, b) => String(a.fileName).localeCompare(String(b.fileName)));
}

async function uploadToStorageAdapter(files, options) {
  const storageAdapter = createStorageAdapter({
    appEnv: requiredEnv("APP_ENV"),
    bucket: requiredEnv("S3_BUCKET"),
    region: requiredEnv("AWS_REGION"),
    endpoint: process.env.S3_ENDPOINT_OVERRIDE || null,
  });
  const uploaded = [];
  for (const entry of files) {
    const fileName = String(entry.fileName || "").trim();
    const sourcePath = String(entry.destinationPath || "").trim();
    const body = fs.readFileSync(sourcePath);
    const key = normalizeStorageKey(`${options.storagePrefix}/${options.runId}/${fileName}`);
    const put = await storageAdapter.putObject({
      key,
      body,
      contentType: "application/json",
      metadata: {
        source_type: "style_dna_taxonomy_rollout",
        run_id: options.runId,
        taxonomy_version: options.taxonomyVersion,
        stage: String(entry.stage || "").trim(),
        manifest_sha256: options.manifestSha256,
      },
    });
    uploaded.push({
      stage: String(entry.stage || "").trim(),
      fileName,
      sourcePath,
      storageKey: put.key,
      storageUri: put.storageUri,
      fileSha256: sha256Buffer(body),
    });
  }
  uploaded.sort((a, b) => String(a.fileName).localeCompare(String(b.fileName)));
  return uploaded;
}

async function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const manifestPath = resolvePath(args.manifestPath);
  const destinationPolicy = resolveDestinationPolicy(args);
  const uploadDir = resolvePath(args.uploadDir);
  if (!manifestPath) {
    throw new Error("manifest-path is required");
  }
  if (destinationPolicy === "local" && !uploadDir) {
    throw new Error("upload-dir is required when destination-policy=local");
  }
  if (destinationPolicy === "storage-adapter" && uploadDir) {
    throw new Error("upload-dir is not allowed when destination-policy=storage-adapter");
  }
  if (!fs.existsSync(manifestPath)) {
    const output = {
      ok: false,
      reason: "manifest_not_found",
      manifestPath,
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const manifestRaw = fs.readFileSync(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const runId = String(manifest?.runId || "").trim();
  const taxonomyVersion = String(manifest?.taxonomyVersion || "").trim();
  const files = Array.isArray(manifest?.files) ? manifest.files : [];
  if (!runId || !taxonomyVersion || files.length === 0) {
    const output = {
      ok: false,
      reason: "invalid_manifest",
      manifestPath,
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const missingSources = files
    .map((entry) => String(entry?.destinationPath || "").trim())
    .filter((filePath) => filePath === "" || !fs.existsSync(filePath));
  if (missingSources.length > 0) {
    const output = {
      ok: false,
      reason: "source_file_missing",
      manifestPath,
      missingSources: missingSources.sort((a, b) => a.localeCompare(b)),
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }

  const manifestSha256 = sha256File(manifestPath);
  const storagePrefix = resolveStoragePrefix(args);
  if (destinationPolicy === "storage-adapter" && storagePrefix === "") {
    throw new Error("storage-prefix must resolve to a non-empty value");
  }
  const runUploadDir = destinationPolicy === "local"
    ? path.join(uploadDir, runId)
    : "";
  const copiedFiles = destinationPolicy === "local"
    ? await copyToLocalUploadDir(files, runUploadDir)
    : await uploadToStorageAdapter(files, {
      runId,
      taxonomyVersion,
      storagePrefix,
      manifestSha256,
    });
  const receiptId = sha256Buffer(
    Buffer.from(
      JSON.stringify({
        runId,
        taxonomyVersion,
        manifestSha256,
        files: copiedFiles.map((entry) => ({
          fileName: entry.fileName,
          fileSha256: entry.fileSha256,
        })),
      }),
      "utf8"
    )
  );

  const receipt = {
    ok: true,
    receiptId,
    runId,
    taxonomyVersion,
    manifestPath,
    manifestSha256,
    destinationPolicy,
    uploadDir: destinationPolicy === "local" ? runUploadDir : null,
    storagePrefix: destinationPolicy === "storage-adapter" ? storagePrefix : null,
    files: copiedFiles,
  };
  const receiptPath = resolvePath(args.output)
    || (destinationPolicy === "local"
      ? path.join(runUploadDir, `${runId}__upload_receipt.json`)
      : path.join(path.dirname(manifestPath), `${runId}__upload_receipt.json`));
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify(
      {
        ...receipt,
        receiptPath,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        reason: "invalid_config",
        message: error.message,
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
});
