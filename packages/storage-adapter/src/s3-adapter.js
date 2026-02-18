const { StorageAdapterError } = require("./errors");

class S3StorageAdapter {
  constructor(config) {
    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint || null;
  }

  mode() {
    return "s3";
  }

  notImplemented(method) {
    throw new StorageAdapterError(
      "S3_NOT_IMPLEMENTED",
      `${method} is not implemented in this scaffold. Use local mode for execution until AWS SDK wiring is added.`,
      {
        bucket: this.bucket,
        region: this.region,
        endpoint: this.endpoint,
      }
    );
  }

  async putObject(_input) {
    this.notImplemented("putObject");
  }

  async getObject(_input) {
    this.notImplemented("getObject");
  }

  async deleteObject(_input) {
    this.notImplemented("deleteObject");
  }

  async getSignedUploadUrl(input) {
    return {
      method: "PUT",
      url: this.endpoint
        ? `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${input.key}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(input.key)}`,
      expiresInSeconds: input.expiresInSeconds || 900,
    };
  }

  async getSignedReadUrl(input) {
    return {
      method: "GET",
      url: this.endpoint
        ? `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${input.key}`
        : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${encodeURIComponent(input.key)}`,
      expiresInSeconds: input.expiresInSeconds || 900,
    };
  }

  async healthcheck() {
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
