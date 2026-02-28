const fs = require("fs");
const path = require("path");
const { validateStyleDnaTaxonomySeedPayload } = require("../../packages/shared-contracts/src");

const DEFAULT_SEEDS_DIR = path.resolve(process.cwd(), "scripts/style-dna/seeds");
const SEED_FILE_PATTERN = /^style-dna-taxonomy-seed-.*\.json$/i;

function listTaxonomySeedFiles(seedDir = DEFAULT_SEEDS_DIR) {
  if (!fs.existsSync(seedDir)) {
    throw new Error(`Taxonomy seed directory does not exist: ${seedDir}`);
  }
  return fs
    .readdirSync(seedDir)
    .filter((name) => SEED_FILE_PATTERN.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(seedDir, name));
}

function loadSeedBundleFromPath(seedPath) {
  const absoluteSeedPath = path.isAbsolute(seedPath)
    ? seedPath
    : path.resolve(process.cwd(), String(seedPath || "").trim());
  if (!fs.existsSync(absoluteSeedPath)) {
    throw new Error(`Taxonomy seed file not found: ${absoluteSeedPath}`);
  }
  const raw = fs.readFileSync(absoluteSeedPath, "utf8");
  const payload = validateStyleDnaTaxonomySeedPayload(JSON.parse(raw));
  return {
    seedPath: absoluteSeedPath,
    fileName: path.basename(absoluteSeedPath),
    taxonomyVersion: payload.taxonomyVersion,
    entryCount: Array.isArray(payload.entries) ? payload.entries.length : 0,
    payload,
  };
}

function loadTaxonomySeedLibrary(seedDir = DEFAULT_SEEDS_DIR) {
  const files = listTaxonomySeedFiles(seedDir);
  if (files.length === 0) {
    throw new Error(`No taxonomy seed bundles found in ${seedDir}`);
  }
  const entries = [];
  const seenTaxonomyVersions = new Set();

  for (const filePath of files) {
    const entry = loadSeedBundleFromPath(filePath);
    if (seenTaxonomyVersions.has(entry.taxonomyVersion)) {
      throw new Error(`Duplicate taxonomyVersion in seed library: ${entry.taxonomyVersion}`);
    }
    seenTaxonomyVersions.add(entry.taxonomyVersion);
    entries.push(entry);
  }

  entries.sort((left, right) => left.taxonomyVersion.localeCompare(right.taxonomyVersion));
  return {
    seedDir,
    entries,
  };
}

function getDefaultTaxonomyVersion(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "style_dna_v1";
  }
  const v1 = entries.find((entry) => entry.taxonomyVersion === "style_dna_v1");
  if (v1) {
    return v1.taxonomyVersion;
  }
  return entries[0].taxonomyVersion;
}

function resolveTaxonomySeedSelection({ seedDir = DEFAULT_SEEDS_DIR, file, taxonomyVersion } = {}) {
  const trimmedFile = String(file || "").trim();
  const trimmedTaxonomyVersion = String(taxonomyVersion || "").trim();

  if (trimmedFile !== "") {
    const entry = loadSeedBundleFromPath(trimmedFile);
    if (trimmedTaxonomyVersion !== "" && entry.taxonomyVersion !== trimmedTaxonomyVersion) {
      throw new Error(
        `Seed taxonomyVersion mismatch: requested ${trimmedTaxonomyVersion}, file contains ${entry.taxonomyVersion}`
      );
    }
    return {
      mode: "file",
      selected: entry,
      library: null,
    };
  }

  const library = loadTaxonomySeedLibrary(seedDir);
  const targetTaxonomyVersion = trimmedTaxonomyVersion || getDefaultTaxonomyVersion(library.entries);
  const selected = library.entries.find((entry) => entry.taxonomyVersion === targetTaxonomyVersion);
  if (!selected) {
    throw new Error(
      `Unknown taxonomyVersion ${targetTaxonomyVersion}. Available: ${library.entries
        .map((entry) => entry.taxonomyVersion)
        .join(", ")}`
    );
  }
  return {
    mode: "library-version",
    selected,
    library,
  };
}

module.exports = {
  DEFAULT_SEEDS_DIR,
  listTaxonomySeedFiles,
  loadSeedBundleFromPath,
  loadTaxonomySeedLibrary,
  getDefaultTaxonomyVersion,
  resolveTaxonomySeedSelection,
};
