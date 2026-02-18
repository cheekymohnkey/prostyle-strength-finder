const ANALYSIS_RUN_QUEUE_STATUSES = [
  "queued",
  "in_progress",
  "succeeded",
  "failed",
  "retrying",
  "dead_letter",
];

function isAnalysisRunStatus(status) {
  return ANALYSIS_RUN_QUEUE_STATUSES.includes(status);
}

function createAnalysisRunStatusEvent(input) {
  const event = {
    analysisRunId: input.analysisRunId,
    jobId: input.jobId,
    status: input.status,
    occurredAt: input.occurredAt || new Date().toISOString(),
    errorCode: input.errorCode || null,
    errorMessage: input.errorMessage || null,
  };

  if (!event.analysisRunId || !event.jobId || !event.status) {
    throw new Error("Missing required analysis run status event fields");
  }

  if (!isAnalysisRunStatus(event.status)) {
    throw new Error(`Invalid analysis run status: ${event.status}`);
  }

  return event;
}

module.exports = {
  ANALYSIS_RUN_QUEUE_STATUSES,
  createAnalysisRunStatusEvent,
  isAnalysisRunStatus,
};
