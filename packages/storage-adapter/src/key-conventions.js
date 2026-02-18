const KEY_PREFIXES = [
  "baseline/",
  "generated/",
  "reference/",
  "uploads/",
  "analysis-artifacts/",
];

function validateStorageKey(key) {
  if (typeof key !== "string" || key.trim() === "") {
    throw new Error("Storage key must be a non-empty string");
  }

  const hasValidPrefix = KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!hasValidPrefix) {
    throw new Error(`Storage key must start with one of: ${KEY_PREFIXES.join(", ")}`);
  }

  if (key.includes("..")) {
    throw new Error("Storage key cannot contain parent-directory traversal segments");
  }

  return key;
}

module.exports = {
  KEY_PREFIXES,
  validateStorageKey,
};
