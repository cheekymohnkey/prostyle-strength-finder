const { loadConfig } = require("./config");
const {
  CONTRACT_VERSION,
  parseAnalysisJobEnvelope,
  createAnalysisRunStatusEvent,
} = require("../../../packages/shared-contracts/src");

function main() {
  const config = loadConfig();
  const sampleEnvelope = parseAnalysisJobEnvelope({
    schemaVersion: CONTRACT_VERSION,
    jobId: "job_epic_a_001",
    idempotencyKey: "idemp_epic_a_001",
    runType: "trait",
    imageId: "img_epic_a_001",
    submittedAt: new Date().toISOString(),
    priority: "normal",
    context: { source: "local_boot" },
  });

  const sampleRunEvent = createAnalysisRunStatusEvent({
    analysisRunId: "run_epic_a_001",
    jobId: sampleEnvelope.jobId,
    status: "queued",
  });

  // Boot verification only for Epic A scope.
  console.log(
    JSON.stringify(
      {
        message: "Worker configuration loaded",
        service: config.observability.serviceName,
        app_env: config.runtime.appEnv,
        queue_url: config.queue.queueUrl,
        contract_version: CONTRACT_VERSION,
        parsed_job: sampleEnvelope,
        run_event: sampleRunEvent,
      },
      null,
      2
    )
  );
}

main();
