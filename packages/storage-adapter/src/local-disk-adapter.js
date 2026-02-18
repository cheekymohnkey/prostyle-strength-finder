const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validateStorageKey } = require("./key-conventions");
const { StorageAdapterError } = require("./errors");

function normalizeBody(body) {
  if (Buffer.isBuffer(body)) {
    return body;
  }
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }
  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  throw new StorageAdapterError("INVALID_BODY", "Storage body must be Buffer, string, or Uint8Array");
}

class LocalDiskStorageAdapter {
  constructor(config) {
    this.bucket = config.bucket;
    const localRoot = process.env.STORAGE_LOCAL_DIR || "./data/storage";
    this.baseDir = path.resolve(localRoot, this.bucket);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  mode() {
    return "local_disk";
  }

  resolvePath(key) {
    validateStorageKey(key);
    return path.join(this.baseDir, key);
  }

  async putObject(input) {
    const key = validateStorageKey(input.key);
    const fullPath = this.resolvePath(key);
    const body = normalizeBody(input.body);
    const metadata = input.metadata || {};
    const contentType = input.contentType || "application/octet-stream";

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, body);
    fs.writeFileSync(
      `${fullPath}.meta.json`,
      JSON.stringify(
        {
          key,
          contentType,
          metadata,
          checksumSha256: crypto.createHash("sha256").update(body).digest("hex"),
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return {
      key,
      storageUri: `local://${this.bucket}/${key}`,
      contentType,
      sizeBytes: body.length,
    };
  }

  async getObject(input) {
    const key = validateStorageKey(input.key);
    const fullPath = this.resolvePath(key);

    if (!fs.existsSync(fullPath)) {
      throw new StorageAdapterError("NOT_FOUND", `Storage key not found: ${key}`);
    }

    const body = fs.readFileSync(fullPath);
    const metaPath = `${fullPath}.meta.json`;
    const metadata = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : {};

    return {
      key,
      body,
      contentType: metadata.contentType || "application/octet-stream",
      metadata: metadata.metadata || {},
      sizeBytes: body.length,
    };
  }

  async deleteObject(input) {
    const key = validateStorageKey(input.key);
    const fullPath = this.resolvePath(key);
    const metaPath = `${fullPath}.meta.json`;

    const existed = fs.existsSync(fullPath);
    if (existed) {
      fs.rmSync(fullPath, { force: true });
    }
    if (fs.existsSync(metaPath)) {
      fs.rmSync(metaPath, { force: true });
    }

    return {
      key,
      deleted: existed,
    };
  }

  async getSignedUploadUrl(input) {
    const key = validateStorageKey(input.key);
    return {
      method: "PUT",
      url: `local://${this.bucket}/${key}`,
      expiresInSeconds: input.expiresInSeconds || 900,
    };
  }

  async getSignedReadUrl(input) {
    const key = validateStorageKey(input.key);
    return {
      method: "GET",
      url: `local://${this.bucket}/${key}`,
      expiresInSeconds: input.expiresInSeconds || 900,
    };
  }

  async healthcheck() {
    fs.mkdirSync(this.baseDir, { recursive: true });
    return {
      mode: this.mode(),
      bucket: this.bucket,
      baseDir: this.baseDir,
    };
  }
}

module.exports = {
  LocalDiskStorageAdapter,
};
