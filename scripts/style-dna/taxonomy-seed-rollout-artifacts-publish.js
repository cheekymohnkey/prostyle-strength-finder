const { spawnSync } = require("child_process");
const path = require("path");

function resolveArgs(argv) {
  const args = {
    artifactDir: "tmp/style-dna-taxonomy-rollouts",
    destinationDir: "",
    runId: "",
    taxonomyVersion: "",
    latest: false,
    destinationPolicy: "",
    storagePrefix: "",
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--artifact-dir" && index + 1 < argv.length) {
      args.artifactDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--destination-dir" && index + 1 < argv.length) {
      args.destinationDir = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--run-id" && index + 1 < argv.length) {
      args.runId = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--taxonomy-version" && index + 1 < argv.length) {
      args.taxonomyVersion = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }
    if (token === "--latest") {
      args.latest = true;
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
      "  node scripts/style-dna/taxonomy-seed-rollout-artifacts-publish.js --destination-dir <dir> [--artifact-dir <dir>] (--run-id <id> | --latest --taxonomy-version <value>) [--destination-policy <local|storage-adapter>] [--storage-prefix <prefix>]",
      "",
      "Behavior:",
      "  Runs export then upload and returns combined output.",
    ].join("\n")
  );
}

function runScript(scriptPath, args) {
  const result = spawnSync("node", [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
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

function main() {
  const args = resolveArgs(process.argv);
  if (args.help) {
    printHelp();
    return;
  }
  const destinationDir = String(args.destinationDir || "").trim();
  if (!destinationDir) {
    throw new Error("destination-dir is required");
  }
  const hasRunId = String(args.runId || "").trim() !== "";
  if (!hasRunId && !args.latest) {
    throw new Error("Provide --run-id or --latest --taxonomy-version");
  }
  if (args.latest && String(args.taxonomyVersion || "").trim() === "") {
    throw new Error("taxonomy-version is required with --latest");
  }

  const exportScript = path.resolve(process.cwd(), "scripts/style-dna/taxonomy-seed-rollout-artifacts-export.js");
  const uploadScript = path.resolve(process.cwd(), "scripts/style-dna/taxonomy-seed-rollout-artifacts-upload.js");
  const destinationPolicy = String(args.destinationPolicy || "").trim().toLowerCase() || "local";
  if (destinationPolicy !== "local" && destinationPolicy !== "storage-adapter") {
    throw new Error(`Invalid destination-policy: ${destinationPolicy}. Expected local or storage-adapter`);
  }

  const exportArgs = [
    "--artifact-dir",
    args.artifactDir,
    "--destination-dir",
    destinationDir,
  ];
  if (hasRunId) {
    exportArgs.push("--run-id", args.runId);
  } else {
    exportArgs.push("--latest", "--taxonomy-version", args.taxonomyVersion);
  }

  const exported = runScript(exportScript, exportArgs);
  if (exported.status !== 0 || !exported.json?.manifestPath) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          reason: "export_failed",
          exportStatus: exported.status,
          exportOutput: exported.json || exported.stdout,
          exportStderr: exported.stderr || null,
        },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
    return;
  }

  const uploadArgs = [
    "--manifest-path",
    exported.json.manifestPath,
    "--destination-policy",
    destinationPolicy,
  ];
  if (destinationPolicy === "local") {
    uploadArgs.push("--upload-dir", destinationDir);
  }
  if (String(args.storagePrefix || "").trim() !== "") {
    uploadArgs.push("--storage-prefix", String(args.storagePrefix).trim());
  }

  const uploaded = runScript(uploadScript, uploadArgs);
  if (uploaded.status !== 0) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          reason: "upload_failed",
          exportOutput: exported.json,
          uploadStatus: uploaded.status,
          uploadOutput: uploaded.json || uploaded.stdout,
          uploadStderr: uploaded.stderr || null,
        },
        null,
        2
      )}\n`
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        export: exported.json,
        upload: uploaded.json,
      },
      null,
      2
    )}\n`
  );
}

main();
