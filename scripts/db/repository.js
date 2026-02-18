const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("./lib");

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function nowIso() {
  return new Date().toISOString();
}

function ensureReady(databaseUrl) {
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  return dbPath;
}

function queryJson(dbPath, sql) {
  const output = runSql(dbPath, sql, { json: true });
  if (!output) {
    return [];
  }
  return JSON.parse(output);
}

function exec(dbPath, sql) {
  runSql(dbPath, sql);
}

function getJobById(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
            model_family, model_version, model_selection_source
     FROM analysis_jobs
     WHERE job_id = ${quote(jobId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getJobByIdempotencyKey(dbPath, idempotencyKey) {
  const rows = queryJson(
    dbPath,
    `SELECT job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
            model_family, model_version, model_selection_source
     FROM analysis_jobs
     WHERE idempotency_key = ${quote(idempotencyKey)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertJob(dbPath, input) {
  const submittedAt = input.submittedAt || nowIso();
  const updatedAt = input.updatedAt || submittedAt;
  exec(
    dbPath,
    `INSERT INTO analysis_jobs (
       job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
       model_family, model_version, model_selection_source
     )
     VALUES (
       ${quote(input.jobId)},
       ${quote(input.idempotencyKey)},
       ${quote(input.runType)},
       ${quote(input.imageId)},
       ${quote(input.status || "queued")},
       ${quote(submittedAt)},
       ${quote(updatedAt)},
       ${quote(input.modelFamily)},
       ${quote(input.modelVersion)},
       ${quote(input.modelSelectionSource)}
     );`
  );
}

function ensureJob(dbPath, input) {
  const existing = getJobById(dbPath, input.jobId);
  if (existing) {
    return existing;
  }
  insertJob(dbPath, input);
  return getJobById(dbPath, input.jobId);
}

function updateJobStatus(dbPath, jobId, status) {
  exec(
    dbPath,
    `UPDATE analysis_jobs
     SET status = ${quote(status)}, updated_at = ${quote(nowIso())}
     WHERE job_id = ${quote(jobId)};`
  );
}

function getNextAttemptCount(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT COALESCE(MAX(attempt_count), 0) + 1 AS next_attempt
     FROM analysis_runs
     WHERE job_id = ${quote(jobId)};`
  );
  return Number(rows[0]?.next_attempt || 1);
}

function insertAnalysisRun(dbPath, input) {
  exec(
    dbPath,
    `INSERT INTO analysis_runs (
       analysis_run_id, job_id, status, attempt_count, started_at, completed_at,
       last_error_code, last_error_message, model_family, model_version
     ) VALUES (
       ${quote(input.analysisRunId)},
       ${quote(input.jobId)},
       ${quote(input.status)},
       ${Number(input.attemptCount || 1)},
       ${quote(input.startedAt || nowIso())},
       ${quote(input.completedAt || null)},
       ${quote(input.lastErrorCode || null)},
       ${quote(input.lastErrorMessage || null)},
       ${quote(input.modelFamily || null)},
       ${quote(input.modelVersion || null)}
     );`
  );
}

function updateAnalysisRun(dbPath, analysisRunId, input) {
  exec(
    dbPath,
    `UPDATE analysis_runs
     SET
       status = ${quote(input.status)},
       completed_at = ${quote(input.completedAt || null)},
       last_error_code = ${quote(input.lastErrorCode || null)},
       last_error_message = ${quote(input.lastErrorMessage || null)}
     WHERE analysis_run_id = ${quote(analysisRunId)};`
  );
}

function getRecommendationExtractionById(dbPath, extractionId) {
  const rows = queryJson(
    dbPath,
    `SELECT extraction_id, status, prompt_text, author, creation_time, source_job_id,
            model_family, model_version, model_selection_source,
            is_baseline, has_profile, has_sref, parser_version,
            metadata_raw_json, created_at, confirmed_at
     FROM recommendation_extractions
     WHERE extraction_id = ${quote(extractionId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertRecommendationExtraction(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO recommendation_extractions (
       extraction_id, status, prompt_text, author, creation_time, source_job_id,
       model_family, model_version, model_selection_source,
       is_baseline, has_profile, has_sref,
       parser_version, metadata_raw_json, created_at, confirmed_at
     ) VALUES (
       ${quote(input.extractionId)},
       ${quote(input.status || "extracted")},
       ${quote(input.promptText)},
       ${quote(input.author || null)},
       ${quote(input.creationTime || null)},
       ${quote(input.sourceJobId || null)},
       ${quote(input.modelFamily)},
       ${quote(input.modelVersion)},
       ${quote(input.modelSelectionSource)},
       ${input.isBaseline ? 1 : 0},
       ${input.hasProfile ? 1 : 0},
       ${input.hasSref ? 1 : 0},
       ${quote(input.parserVersion)},
       ${quote(JSON.stringify(input.metadataRaw || []))},
       ${quote(createdAt)},
       ${quote(input.confirmedAt || null)}
     );`
  );
}

function markRecommendationExtractionConfirmed(dbPath, extractionId) {
  const confirmedAt = nowIso();
  exec(
    dbPath,
    `UPDATE recommendation_extractions
     SET status = 'confirmed', confirmed_at = ${quote(confirmedAt)}
     WHERE extraction_id = ${quote(extractionId)};`
  );
  return confirmedAt;
}

module.exports = {
  ensureReady,
  getJobById,
  getJobByIdempotencyKey,
  insertJob,
  ensureJob,
  updateJobStatus,
  getNextAttemptCount,
  insertAnalysisRun,
  updateAnalysisRun,
  getRecommendationExtractionById,
  insertRecommendationExtraction,
  markRecommendationExtractionConfirmed,
};
