const { createStorageAdapter } = require("../../packages/storage-adapter/src");

function requiredEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

async function main() {
  const adapter = createStorageAdapter({
    appEnv: requiredEnv("APP_ENV"),
    bucket: requiredEnv("S3_BUCKET"),
    region: requiredEnv("AWS_REGION"),
    endpoint: process.env.S3_ENDPOINT_OVERRIDE || null,
  });

  const key = `uploads/smoke-${Date.now()}.txt`;
  const payload = `storage-smoke-${new Date().toISOString()}`;

  const health = await adapter.healthcheck();
  const putResult = await adapter.putObject({
    key,
    body: payload,
    contentType: "text/plain",
    metadata: {
      source_type: "smoke",
      uploader_id: "local-dev",
      created_at: new Date().toISOString(),
    },
  });

  const readResult = await adapter.getObject({ key });
  const deleteResult = await adapter.deleteObject({ key });

  console.log(
    JSON.stringify(
      {
        health,
        put: {
          key: putResult.key,
          storageUri: putResult.storageUri,
          sizeBytes: putResult.sizeBytes,
        },
        get: {
          key: readResult.key,
          text: readResult.body.toString("utf8"),
          contentType: readResult.contentType,
          metadata: readResult.metadata,
        },
        del: deleteResult,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
