const { LocalDiskStorageAdapter } = require("./local-disk-adapter");
const { S3StorageAdapter } = require("./s3-adapter");
const { KEY_PREFIXES, validateStorageKey } = require("./key-conventions");
const { StorageAdapterError } = require("./errors");

function createStorageAdapter(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Storage adapter config is required");
  }

  if (!config.bucket || !config.region) {
    throw new Error("Storage adapter requires bucket and region");
  }

  if (config.appEnv === "local") {
    return new LocalDiskStorageAdapter(config);
  }

  return new S3StorageAdapter(config);
}

module.exports = {
  createStorageAdapter,
  KEY_PREFIXES,
  validateStorageKey,
  StorageAdapterError,
};
