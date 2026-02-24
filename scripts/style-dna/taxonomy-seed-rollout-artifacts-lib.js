const fs = require("fs");
const path = require("path");

const STAGES = ["coverage", "diff_before", "apply", "diff_after", "summary"];

function compareByString(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function resolvePath(rawPath) {
  const trimmed = String(rawPath || "").trim();
  if (trimmed === "") {
    return "";
  }
  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);
}

function parseArtifactName(fileName) {
  const match = /^(.+)__(coverage|diff_before|apply|diff_after|summary)\.json$/.exec(String(fileName || ""));
  if (!match) {
    return null;
  }
  return {
    runId: match[1],
    stage: match[2],
  };
}

function readJsonFileSafe(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function collectRuns(artifactDir) {
  if (!fs.existsSync(artifactDir)) {
    return [];
  }
  const entries = fs.readdirSync(artifactDir);
  const runMap = new Map();

  entries.forEach((name) => {
    const parsed = parseArtifactName(name);
    if (!parsed) {
      return;
    }
    const filePath = path.join(artifactDir, name);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return;
    }
    if (!runMap.has(parsed.runId)) {
      runMap.set(parsed.runId, {
        runId: parsed.runId,
        stages: {},
        latestMtimeMs: 0,
        createdAt: null,
      });
    }
    const run = runMap.get(parsed.runId);
    run.stages[parsed.stage] = filePath;
    if (stat.mtimeMs > run.latestMtimeMs) {
      run.latestMtimeMs = stat.mtimeMs;
      run.createdAt = stat.mtime.toISOString();
    }
  });

  const runs = Array.from(runMap.values()).map((run) => {
    const summaryPath = run.stages.summary || null;
    const summaryJson = summaryPath ? readJsonFileSafe(summaryPath) : null;
    const taxonomyVersion = String(summaryJson?.taxonomyVersion || "unknown").trim() || "unknown";
    const stageAvailability = {};
    STAGES.forEach((stage) => {
      stageAvailability[stage] = Boolean(run.stages[stage]);
    });
    return {
      runId: run.runId,
      taxonomyVersion,
      createdAt: run.createdAt,
      latestMtimeMs: run.latestMtimeMs,
      summaryPath,
      stagePaths: run.stages,
      stageAvailability,
    };
  });

  runs.sort((a, b) => (
    b.latestMtimeMs - a.latestMtimeMs
    || compareByString(a.runId, b.runId)
  ));
  return runs;
}

function groupRunsByTaxonomy(runs) {
  const groups = new Map();
  (Array.isArray(runs) ? runs : []).forEach((run) => {
    const key = String(run.taxonomyVersion || "unknown");
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(run);
  });
  for (const list of groups.values()) {
    list.sort((a, b) => (
      b.latestMtimeMs - a.latestMtimeMs
      || compareByString(a.runId, b.runId)
    ));
  }
  return groups;
}

module.exports = {
  STAGES,
  resolvePath,
  collectRuns,
  groupRunsByTaxonomy,
};
