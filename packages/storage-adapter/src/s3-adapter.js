const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { StorageAdapterError } = require("./errors");
const { validateStorageKey } = require("./key-conventions");

function toMetadataArg(metadata) {
  const entries = Object.entries(metadata || {});
  if (entries.length === 0) {
    return null;
  }

  return entries
    .map(([key, value]) => `${String(key)}=${String(value)}`)
    .join(",");
}

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

class S3StorageAdapter {
  constructor(config) {
    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint || null;
  }

  mode() {
    return "s3";
  }

  awsArgs(command, args) {
    const full = [command, ...args, "--region", this.region];
    if (this.endpoint) {
      full.push("--endpoint-url", this.endpoint);
    }
    return full;
  }

  runAws(command, args) {
    const result = spawnSync("aws", this.awsArgs(command, args), {
      encoding: "utf8",
    });

    if (result.status !== 0) {
      throw new StorageAdapterError(
        "S3_OPERATION_FAILED",
        (result.stderr || result.stdout || `aws ${command} failed`).trim(),
        {
          bucket: this.bucket,
          region: this.region,
          endpoint: this.endpoint,
          command,
        }
      );
    }

    return result.stdout ? result.stdout.trim() : "";
  }

  withTempFile(buffer, fn) {
    const tmpPath = path.join(
      os.tmpdir(),
      `prostyle-s3-${Date.now()}-${crypto.randomUUID()}`
    );
    fs.writeFileSync(tmpPath, buffer);
    try {
      return fn(tmpPath);
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.rmSync(tmpPath, { force: true });
      }
    }
  }

  async putObject(input) {
    const key = validateStorageKey(input.key);
    const body = normalizeBody(input.body);
    const metadataArg = toMetadataArg(input.metadata || {});
    const contentType = input.contentType || "application/octet-stream";

    this.withTempFile(body, (tmpPath) => {
      const args = [
        "put-object",
        "--bucket",
        this.bucket,
        "--key",
        key,
        "--body",
        tmpPath,
        "--content-type",
        contentType,
      ];
      if (metadataArg) {
        args.push("--metadata", metadataArg);
      }
      this.runAws("s3api", args);
    });

    return {
      key,
      storageUri: `s3://${this.bucket}/${key}`,
      contentType,
      sizeBytes: body.length,
    };
  }

  async getObject(input) {
    const key = validateStorageKey(input.key);

    const tmpPath = path.join(
      os.tmpdir(),
      `prostyle-s3-get-${Date.now()}-${crypto.randomUUID()}`
    );

    try {
      const output = this.runAws("s3api", [
        "get-object",
        "--bucket",
        this.bucket,
        "--key",
        key,
        tmpPath,
        "--output",
        "json",
      ]);

      const body = fs.readFileSync(tmpPath);
      const payload = output ? JSON.parse(output) : {};

      return {
        key,
        body,
        contentType: payload.ContentType || "application/octet-stream",
        metadata: payload.Metadata || {},
        sizeBytes: body.length,
      };
    } catch (error) {
      if (error instanceof StorageAdapterError) {
        if (String(error.message).includes("NoSuchKey") || String(error.message).includes("Not Found")) {
          throw new StorageAdapterError("NOT_FOUND", `Storage key not found: ${key}`);
        }
      }
      throw error;
    } finally {
      if (fs.existsSync(tmpPath)) {
        fs.rmSync(tmpPath, { force: true });
      }
    }
  }

  async deleteObject(input) {
    const key = validateStorageKey(input.key);
    this.runAws("s3api", [
      "delete-object",
      "--bucket",
      this.bucket,
      "--key",
      key,
    ]);

    return {
      key,
      deleted: true,
    };
  }

  async getSignedUploadUrl(input) {
    const key = validateStorageKey(input.key);
    const expiresInSeconds = input.expiresInSeconds || 900;
    const url = this.runAws("s3", [
      "presign",
      `s3://${this.bucket}/${key}`,
      "--expires-in",
      String(expiresInSeconds),
      "--http-method",
      "PUT",
    ]);

    return {
      method: "PUT",
      url,
      expiresInSeconds,
    };
  }

  async getSignedReadUrl(input) {
    const key = validateStorageKey(input.key);
    const expiresInSeconds = input.expiresInSeconds || 900;
    const url = this.runAws("s3", [
      "presign",
      `s3://${this.bucket}/${key}`,
      "--expires-in",
      String(expiresInSeconds),
      "--http-method",
      "GET",
    ]);

    return {
      method: "GET",
      url,
      expiresInSeconds,
    };
  }

  async healthcheck() {
    this.runAws("s3api", [
      "head-bucket",
      "--bucket",
      this.bucket,
    ]);

    return {
      mode: this.mode(),
      bucket: this.bucket,
      region: this.region,
      endpoint: this.endpoint,
    };
  }
}

module.exports = {
  S3StorageAdapter,
};
