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

function getUserById(dbPath, userId) {
  const rows = queryJson(
    dbPath,
    `SELECT user_id, role, status, created_at, updated_at
     FROM users
     WHERE user_id = ${quote(userId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertUser(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO users (
       user_id, role, status, created_at, updated_at
     ) VALUES (
       ${quote(input.userId)},
       ${quote(input.role || "consumer")},
       ${quote(input.status || "active")},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function ensureUser(dbPath, input) {
  const existing = getUserById(dbPath, input.userId);
  if (existing) {
    return existing;
  }
  insertUser(dbPath, input);
  return getUserById(dbPath, input.userId);
}

function updateUserRoleStatus(dbPath, userId, input) {
  exec(
    dbPath,
    `UPDATE users
     SET
       role = ${quote(input.role)},
       status = ${quote(input.status)},
       updated_at = ${quote(nowIso())}
     WHERE user_id = ${quote(userId)};`
  );
  return getUserById(dbPath, userId);
}

function listUsers(dbPath, input = {}) {
  const where = [];
  if (input.role) {
    where.push(`role = ${quote(input.role)}`);
  }
  if (input.status) {
    where.push(`status = ${quote(input.status)}`);
  }
  if (input.query) {
    const pattern = `%${String(input.query).replace(/%/g, "\\%").replace(/_/g, "\\_")}%`;
    where.push(`user_id LIKE ${quote(pattern)} ESCAPE '\\'`);
  }
  if (input.cursorUpdatedAt && input.cursorUserId) {
    where.push(
      `(
        updated_at < ${quote(input.cursorUpdatedAt)}
        OR (updated_at = ${quote(input.cursorUpdatedAt)} AND user_id > ${quote(input.cursorUserId)})
      )`
    );
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rawLimit = Number(input.limit || 50);
  const safeLimit = Number.isFinite(rawLimit)
    ? Math.min(200, Math.max(1, Math.floor(rawLimit)))
    : 50;
  const queryLimit = safeLimit + 1;

  return queryJson(
    dbPath,
    `SELECT user_id, role, status, created_at, updated_at
     FROM users
     ${whereClause}
     ORDER BY updated_at DESC, user_id ASC
     LIMIT ${queryLimit};`
  );
}

function getJobById(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
            model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
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
            model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
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
       model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
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
       ${quote(input.modelSelectionSource)},
       ${quote(input.moderationStatus || "none")},
       ${quote(input.rerunOfJobId || null)}
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

function updateJobModerationStatus(dbPath, jobId, moderationStatus) {
  exec(
    dbPath,
    `UPDATE analysis_jobs
     SET moderation_status = ${quote(moderationStatus)}, updated_at = ${quote(nowIso())}
     WHERE job_id = ${quote(jobId)};`
  );
}

function listRerunJobsByParentJobId(dbPath, parentJobId) {
  return queryJson(
    dbPath,
    `SELECT job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
            model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
     FROM analysis_jobs
     WHERE rerun_of_job_id = ${quote(parentJobId)}
     ORDER BY submitted_at DESC;`
  );
}

function getApprovalPolicy(dbPath) {
  const rows = queryJson(
    dbPath,
    `SELECT policy_scope, approval_mode, updated_by, created_at, updated_at
     FROM approval_policies
     WHERE policy_scope = 'global'
     LIMIT 1;`
  );
  if (rows[0]) {
    return rows[0];
  }

  const createdAt = nowIso();
  exec(
    dbPath,
    `INSERT INTO approval_policies (
       policy_scope, approval_mode, updated_by, created_at, updated_at
     ) VALUES (
       'global',
       'auto-approve',
       'system',
       ${quote(createdAt)},
       ${quote(createdAt)}
     );`
  );
  return getApprovalPolicy(dbPath);
}

function upsertApprovalPolicy(dbPath, input) {
  const now = nowIso();
  exec(
    dbPath,
    `INSERT INTO approval_policies (
       policy_scope, approval_mode, updated_by, created_at, updated_at
     ) VALUES (
       'global',
       ${quote(input.approvalMode)},
       ${quote(input.updatedBy || null)},
       ${quote(now)},
       ${quote(now)}
     )
     ON CONFLICT(policy_scope) DO UPDATE SET
       approval_mode = excluded.approval_mode,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at;`
  );
  return getApprovalPolicy(dbPath);
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

function getLatestAnalysisRunByJobId(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT analysis_run_id, job_id, status, attempt_count, started_at, completed_at,
            last_error_code, last_error_message, model_family, model_version
     FROM analysis_runs
     WHERE job_id = ${quote(jobId)}
     ORDER BY attempt_count DESC, started_at DESC
     LIMIT 1;`
  );
  return rows[0] || null;
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

function insertImageTraitAnalysis(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO image_trait_analyses (
       image_trait_analysis_id, analysis_run_id, job_id, image_id, trait_schema_version,
       trait_vector_json, evidence_summary, created_at
     ) VALUES (
       ${quote(input.imageTraitAnalysisId)},
       ${quote(input.analysisRunId)},
       ${quote(input.jobId)},
       ${quote(input.imageId)},
       ${quote(input.traitSchemaVersion)},
       ${quote(JSON.stringify(input.traitVector || {}))},
       ${quote(input.evidenceSummary || null)},
       ${quote(createdAt)}
     );`
  );
}

function getImageTraitAnalysisByJobId(dbPath, jobId) {
  const rows = queryJson(
    dbPath,
    `SELECT image_trait_analysis_id, analysis_run_id, job_id, image_id, trait_schema_version,
            trait_vector_json, evidence_summary, created_at
     FROM image_trait_analyses
     WHERE job_id = ${quote(jobId)}
     ORDER BY created_at DESC
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getStyleInfluenceById(dbPath, styleInfluenceId) {
  const rows = queryJson(
    dbPath,
    `SELECT style_influence_id, style_influence_type_id, influence_code, status,
            pinned_flag, created_by, created_at
     FROM style_influences
     WHERE style_influence_id = ${quote(styleInfluenceId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getStyleInfluenceTypeByKey(dbPath, typeKey) {
  const rows = queryJson(
    dbPath,
    `SELECT style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
     FROM style_influence_types
     WHERE type_key = ${quote(typeKey)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getStyleInfluenceTypeById(dbPath, styleInfluenceTypeId) {
  const rows = queryJson(
    dbPath,
    `SELECT style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
     FROM style_influence_types
     WHERE style_influence_type_id = ${quote(styleInfluenceTypeId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertStyleInfluenceType(dbPath, input) {
  exec(
    dbPath,
    `INSERT INTO style_influence_types (
       style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
     ) VALUES (
       ${quote(input.styleInfluenceTypeId)},
       ${quote(input.typeKey)},
       ${quote(input.label)},
       ${quote(input.parameterPrefix)},
       ${quote(input.relatedParameterName || null)},
       ${quote(input.description || null)},
       ${Number(input.enabledFlag === undefined ? 1 : input.enabledFlag)}
     );`
  );
}

function ensureStyleInfluenceTypeByKey(dbPath, input) {
  const existing = getStyleInfluenceTypeByKey(dbPath, input.typeKey);
  if (existing) {
    return existing;
  }
  insertStyleInfluenceType(dbPath, input);
  return getStyleInfluenceTypeByKey(dbPath, input.typeKey);
}

function insertStyleInfluence(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO style_influences (
       style_influence_id, style_influence_type_id, influence_code, status,
       pinned_flag, created_by, created_at
     ) VALUES (
       ${quote(input.styleInfluenceId)},
       ${quote(input.styleInfluenceTypeId)},
       ${quote(input.influenceCode)},
       ${quote(input.status || "active")},
       ${input.pinnedFlag ? 1 : 0},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)}
     );`
  );
}

function updateStyleInfluenceGovernance(dbPath, styleInfluenceId, action) {
  const normalized = String(action || "").trim();
  if (normalized === "disable") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET status = 'disabled'
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else if (normalized === "pin") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET pinned_flag = 1
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else if (normalized === "unpin") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET pinned_flag = 0
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else if (normalized === "remove") {
    exec(
      dbPath,
      `UPDATE style_influences
       SET status = 'removed',
           pinned_flag = 0
       WHERE style_influence_id = ${quote(styleInfluenceId)};`
    );
  } else {
    throw new Error(`Unsupported governance action: ${action}`);
  }

  return getStyleInfluenceById(dbPath, styleInfluenceId);
}

function insertAdminActionAudit(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO admin_actions_audit (
       admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
     ) VALUES (
       ${quote(input.adminActionAuditId)},
       ${quote(input.adminUserId)},
       ${quote(input.actionType)},
       ${quote(input.targetType)},
       ${quote(input.targetId)},
       ${quote(input.reason)},
       ${quote(createdAt)}
     );`
  );
}

function listAdminActionsAuditByTarget(dbPath, targetType, targetId) {
  return queryJson(
    dbPath,
    `SELECT admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
     FROM admin_actions_audit
     WHERE target_type = ${quote(targetType)}
       AND target_id = ${quote(targetId)}
     ORDER BY created_at DESC;`
  );
}

function getContributorSubmissionById(dbPath, submissionId) {
  const rows = queryJson(
    dbPath,
    `SELECT submission_id, owner_user_id, style_influence_id, source_image_id, status, last_job_id, created_at, updated_at
     FROM contributor_submissions
     WHERE submission_id = ${quote(submissionId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listContributorSubmissionsByOwnerUserId(dbPath, ownerUserId) {
  return queryJson(
    dbPath,
    `SELECT submission_id, owner_user_id, style_influence_id, source_image_id, status, last_job_id, created_at, updated_at
     FROM contributor_submissions
     WHERE owner_user_id = ${quote(ownerUserId)}
     ORDER BY updated_at DESC;`
  );
}

function insertContributorSubmission(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO contributor_submissions (
       submission_id, owner_user_id, style_influence_id, source_image_id,
       status, last_job_id, created_at, updated_at
     ) VALUES (
       ${quote(input.submissionId)},
       ${quote(input.ownerUserId)},
       ${quote(input.styleInfluenceId)},
       ${quote(input.sourceImageId)},
       ${quote(input.status || "created")},
       ${quote(input.lastJobId || null)},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function updateContributorSubmissionStatusAndJob(dbPath, submissionId, input) {
  exec(
    dbPath,
    `UPDATE contributor_submissions
     SET
       status = ${quote(input.status)},
       last_job_id = ${quote(input.lastJobId || null)},
       updated_at = ${quote(nowIso())}
     WHERE submission_id = ${quote(submissionId)};`
  );
}

function insertContributorSubmissionAction(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO contributor_submission_actions (
       contributor_submission_action_id, submission_id, user_id, action_type, job_id, created_at
     ) VALUES (
       ${quote(input.contributorSubmissionActionId)},
       ${quote(input.submissionId)},
       ${quote(input.userId)},
       ${quote(input.actionType)},
       ${quote(input.jobId || null)},
       ${quote(createdAt)}
     );`
  );
}

function listContributorSubmissionActionsBySubmissionId(dbPath, submissionId) {
  return queryJson(
    dbPath,
    `SELECT contributor_submission_action_id, submission_id, user_id, action_type, job_id, created_at
     FROM contributor_submission_actions
     WHERE submission_id = ${quote(submissionId)}
     ORDER BY created_at DESC;`
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
  exec(
    dbPath,
    `UPDATE recommendation_extractions
     SET
       status = 'confirmed',
       confirmed_at = COALESCE(confirmed_at, ${quote(nowIso())})
     WHERE extraction_id = ${quote(extractionId)};`
  );
  const extraction = getRecommendationExtractionById(dbPath, extractionId);
  return extraction ? extraction.confirmed_at : null;
}

function getPromptByText(dbPath, promptText) {
  const rows = queryJson(
    dbPath,
    `SELECT prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
     FROM prompts
     WHERE prompt_text = ${quote(promptText)}
     ORDER BY
       CASE status
         WHEN 'active' THEN 0
         WHEN 'experimental' THEN 1
         WHEN 'deprecated' THEN 2
         ELSE 3
       END ASC,
       created_at DESC
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getPromptById(dbPath, promptId) {
  const rows = queryJson(
    dbPath,
    `SELECT prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
     FROM prompts
     WHERE prompt_id = ${quote(promptId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertPrompt(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO prompts (
       prompt_id, prompt_text, status, version, curated_flag, created_by, created_at
     ) VALUES (
       ${quote(input.promptId)},
       ${quote(input.promptText)},
       ${quote(input.status || "active")},
       ${quote(input.version || "v1")},
       ${input.curatedFlag ? 1 : 0},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)}
     );`
  );
}

function ensurePromptByText(dbPath, input) {
  const existing = getPromptByText(dbPath, input.promptText);
  if (existing) {
    return existing;
  }

  insertPrompt(dbPath, input);
  return getPromptByText(dbPath, input.promptText);
}

function updatePromptCurationStatus(dbPath, promptId, status) {
  exec(
    dbPath,
    `UPDATE prompts
     SET status = ${quote(status)}
     WHERE prompt_id = ${quote(promptId)};`
  );
  return getPromptById(dbPath, promptId);
}

function getRecommendationSessionByExtractionId(dbPath, extractionId) {
  const rows = queryJson(
    dbPath,
    `SELECT session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
     FROM recommendation_sessions
     WHERE extraction_id = ${quote(extractionId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getRecommendationSessionById(dbPath, sessionId) {
  const rows = queryJson(
    dbPath,
    `SELECT session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
     FROM recommendation_sessions
     WHERE session_id = ${quote(sessionId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertRecommendationSession(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO recommendation_sessions (
       session_id, user_id, mode, extraction_id, prompt_id, status, created_at, updated_at
     ) VALUES (
       ${quote(input.sessionId)},
       ${quote(input.userId)},
       ${quote(input.mode)},
       ${quote(input.extractionId)},
       ${quote(input.promptId)},
       ${quote(input.status || "confirmed")},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function updateRecommendationSessionStatus(dbPath, sessionId, status) {
  exec(
    dbPath,
    `UPDATE recommendation_sessions
     SET
       status = ${quote(status)},
       updated_at = ${quote(nowIso())}
     WHERE session_id = ${quote(sessionId)};`
  );
}

function ensureRecommendationSession(dbPath, input) {
  const existing = getRecommendationSessionByExtractionId(dbPath, input.extractionId);
  if (existing) {
    return existing;
  }

  insertRecommendationSession(dbPath, input);
  return getRecommendationSessionByExtractionId(dbPath, input.extractionId);
}

function insertRecommendation(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO recommendations (
       recommendation_id, recommendation_session_id, rank, combination_id,
       rationale, confidence, risk_notes_json, prompt_improvements_json, created_at
     ) VALUES (
       ${quote(input.recommendationId)},
       ${quote(input.recommendationSessionId)},
       ${Number(input.rank)},
       ${quote(input.combinationId)},
       ${quote(input.rationale)},
       ${Number(input.confidence)},
       ${quote(JSON.stringify(input.riskNotes || []))},
       ${quote(JSON.stringify(input.promptImprovements || []))},
       ${quote(createdAt)}
     );`
  );
}

function listRecommendationsBySessionId(dbPath, sessionId) {
  return queryJson(
    dbPath,
    `SELECT recommendation_id, recommendation_session_id, rank, combination_id,
            rationale, confidence, risk_notes_json, prompt_improvements_json, created_at
     FROM recommendations
     WHERE recommendation_session_id = ${quote(sessionId)}
     ORDER BY rank ASC;`
  );
}

function getRecommendationCountBySessionId(dbPath, sessionId) {
  const rows = queryJson(
    dbPath,
    `SELECT COUNT(*) AS recommendation_count
     FROM recommendations
     WHERE recommendation_session_id = ${quote(sessionId)};`
  );
  return Number(rows[0]?.recommendation_count || 0);
}

function getRecommendationById(dbPath, recommendationId) {
  const rows = queryJson(
    dbPath,
    `SELECT recommendation_id, recommendation_session_id, rank, combination_id,
            rationale, confidence, risk_notes_json, prompt_improvements_json, created_at
     FROM recommendations
     WHERE recommendation_id = ${quote(recommendationId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertGeneratedImage(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO generated_images (
       generated_image_id, recommendation_session_id, source_type, storage_key,
       storage_uri, mime_type, file_name, size_bytes, uploaded_by, created_at
     ) VALUES (
       ${quote(input.generatedImageId)},
       ${quote(input.recommendationSessionId)},
       ${quote(input.sourceType || "generated")},
       ${quote(input.storageKey)},
       ${quote(input.storageUri)},
       ${quote(input.mimeType)},
       ${quote(input.fileName)},
       ${Number(input.sizeBytes)},
       ${quote(input.uploadedBy)},
       ${quote(createdAt)}
     );`
  );
}

function getGeneratedImageById(dbPath, generatedImageId) {
  const rows = queryJson(
    dbPath,
    `SELECT generated_image_id, recommendation_session_id, source_type, storage_key,
            storage_uri, mime_type, file_name, size_bytes, uploaded_by, created_at
     FROM generated_images
     WHERE generated_image_id = ${quote(generatedImageId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertPostResultFeedback(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO post_result_feedback (
       feedback_id, recommendation_session_id, recommendation_id, generated_image_id,
       emoji_rating, useful_flag, comments, evidence_strength, created_by, created_at, updated_at
     ) VALUES (
       ${quote(input.feedbackId)},
       ${quote(input.recommendationSessionId)},
       ${quote(input.recommendationId)},
       ${quote(input.generatedImageId || null)},
       ${quote(input.emojiRating || null)},
       ${input.usefulFlag === null || input.usefulFlag === undefined ? "NULL" : (input.usefulFlag ? 1 : 0)},
       ${quote(input.comments || null)},
       ${quote(input.evidenceStrength || "minor")},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function getPostResultFeedbackById(dbPath, feedbackId) {
  const rows = queryJson(
    dbPath,
    `SELECT feedback_id, recommendation_session_id, recommendation_id, generated_image_id,
            emoji_rating, useful_flag, comments, evidence_strength, created_by, created_at, updated_at
     FROM post_result_feedback
     WHERE feedback_id = ${quote(feedbackId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listPostResultFeedbackBySessionId(dbPath, sessionId) {
  return queryJson(
    dbPath,
    `SELECT feedback_id, recommendation_session_id, recommendation_id, generated_image_id,
            emoji_rating, useful_flag, comments, evidence_strength, created_by, created_at, updated_at
     FROM post_result_feedback
     WHERE recommendation_session_id = ${quote(sessionId)}
     ORDER BY created_at DESC;`
  );
}

function insertAlignmentEvaluation(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO alignment_evaluations (
       alignment_evaluation_id, feedback_id, alignment_score, mismatch_summary,
       suggested_prompt_adjustments_json, alternative_combination_ids_json, confidence_delta, created_at
     ) VALUES (
       ${quote(input.alignmentEvaluationId)},
       ${quote(input.feedbackId)},
       ${Number(input.alignmentScore)},
       ${quote(input.mismatchSummary)},
       ${quote(JSON.stringify(input.suggestedPromptAdjustments || []))},
       ${quote(JSON.stringify(input.alternativeCombinationIds || []))},
       ${Number(input.confidenceDelta || 0)},
       ${quote(createdAt)}
     );`
  );
}

function getAlignmentEvaluationByFeedbackId(dbPath, feedbackId) {
  const rows = queryJson(
    dbPath,
    `SELECT alignment_evaluation_id, feedback_id, alignment_score, mismatch_summary,
            suggested_prompt_adjustments_json, alternative_combination_ids_json, confidence_delta, created_at
     FROM alignment_evaluations
     WHERE feedback_id = ${quote(feedbackId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listActiveStyleInfluenceCombinations(dbPath) {
  return queryJson(
    dbPath,
    `SELECT
       c.combination_id,
       c.name,
       COUNT(*) AS total_items,
       SUM(CASE WHEN sit.parameter_prefix = '--profile' THEN 1 ELSE 0 END) AS profile_items,
       SUM(CASE WHEN sit.parameter_prefix = '--sref' THEN 1 ELSE 0 END) AS sref_items,
       SUM(CASE WHEN si.pinned_flag = 1 THEN 1 ELSE 0 END) AS pinned_items,
       SUM(CASE WHEN si.status = 'active' AND sit.enabled_flag = 1 THEN 1 ELSE 0 END) AS eligible_items,
       GROUP_CONCAT(si.influence_code, ' ') AS influence_codes
     FROM style_influence_combinations c
     JOIN style_influence_combination_items sci
       ON sci.combination_id = c.combination_id
     JOIN style_influences si
       ON si.style_influence_id = sci.style_influence_id
     JOIN style_influence_types sit
       ON sit.style_influence_type_id = si.style_influence_type_id
     WHERE c.active_flag = 1
     GROUP BY c.combination_id, c.name
     HAVING total_items > 0 AND eligible_items = total_items
     ORDER BY c.combination_id ASC;`
  );
}

function getBaselinePromptSuiteById(dbPath, suiteId) {
  const rows = queryJson(
    dbPath,
    `SELECT suite_id, name, suite_version, status, created_by, created_at
     FROM baseline_prompt_suites
     WHERE suite_id = ${quote(suiteId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertBaselinePromptSuite(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO baseline_prompt_suites (
       suite_id, name, suite_version, status, created_by, created_at
     ) VALUES (
       ${quote(input.suiteId)},
       ${quote(input.name)},
       ${quote(input.suiteVersion)},
       ${quote(input.status || "active")},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)}
     );`
  );
}

function ensureBaselinePromptSuiteById(dbPath, input) {
  const existing = getBaselinePromptSuiteById(dbPath, input.suiteId);
  if (existing) {
    return existing;
  }
  insertBaselinePromptSuite(dbPath, input);
  return getBaselinePromptSuiteById(dbPath, input.suiteId);
}

function getBaselinePromptSuiteItemByPromptKey(dbPath, suiteId, promptKey) {
  const rows = queryJson(
    dbPath,
    `SELECT item_id, suite_id, prompt_key, prompt_text, display_order, created_at
     FROM baseline_prompt_suite_items
     WHERE suite_id = ${quote(suiteId)}
       AND prompt_key = ${quote(promptKey)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listBaselinePromptSuiteItems(dbPath, suiteId) {
  return queryJson(
    dbPath,
    `SELECT item_id, suite_id, prompt_key, prompt_text, display_order, created_at
     FROM baseline_prompt_suite_items
     WHERE suite_id = ${quote(suiteId)}
     ORDER BY display_order ASC, prompt_key ASC;`
  );
}

function insertBaselinePromptSuiteItem(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO baseline_prompt_suite_items (
       item_id, suite_id, prompt_key, prompt_text, display_order, created_at
     ) VALUES (
       ${quote(input.itemId)},
       ${quote(input.suiteId)},
       ${quote(input.promptKey)},
       ${quote(input.promptText)},
       ${Number(input.displayOrder || 0)},
       ${quote(createdAt)}
     );`
  );
}

function ensureBaselinePromptSuiteItemByPromptKey(dbPath, input) {
  const existing = getBaselinePromptSuiteItemByPromptKey(dbPath, input.suiteId, input.promptKey);
  if (existing) {
    return existing;
  }
  insertBaselinePromptSuiteItem(dbPath, input);
  return getBaselinePromptSuiteItemByPromptKey(dbPath, input.suiteId, input.promptKey);
}

function getBaselineRenderSetById(dbPath, baselineRenderSetId) {
  const rows = queryJson(
    dbPath,
    `SELECT baseline_render_set_id, mj_model_family, mj_model_version, suite_id,
            parameter_envelope_json, parameter_envelope_hash, status, created_by, created_at
     FROM baseline_render_sets
     WHERE baseline_render_set_id = ${quote(baselineRenderSetId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getBaselineRenderSetByCompatibility(dbPath, input) {
  const rows = queryJson(
    dbPath,
    `SELECT baseline_render_set_id, mj_model_family, mj_model_version, suite_id,
            parameter_envelope_json, parameter_envelope_hash, status, created_by, created_at
     FROM baseline_render_sets
     WHERE mj_model_family = ${quote(input.mjModelFamily)}
       AND mj_model_version = ${quote(input.mjModelVersion)}
       AND suite_id = ${quote(input.suiteId)}
       AND parameter_envelope_hash = ${quote(input.parameterEnvelopeHash)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listBaselineRenderSets(dbPath, input = {}) {
  const where = [];
  if (input.mjModelFamily) {
    where.push(`mj_model_family = ${quote(input.mjModelFamily)}`);
  }
  if (input.mjModelVersion) {
    where.push(`mj_model_version = ${quote(input.mjModelVersion)}`);
  }
  if (input.suiteId) {
    where.push(`suite_id = ${quote(input.suiteId)}`);
  }
  if (input.status) {
    where.push(`status = ${quote(input.status)}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  return queryJson(
    dbPath,
    `SELECT baseline_render_set_id, mj_model_family, mj_model_version, suite_id,
            parameter_envelope_json, parameter_envelope_hash, status, created_by, created_at
     FROM baseline_render_sets
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${Number(input.limit || 100)};`
  );
}

function insertBaselineRenderSet(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO baseline_render_sets (
       baseline_render_set_id, mj_model_family, mj_model_version, suite_id,
       parameter_envelope_json, parameter_envelope_hash, status, created_by, created_at
     ) VALUES (
       ${quote(input.baselineRenderSetId)},
       ${quote(input.mjModelFamily)},
       ${quote(input.mjModelVersion)},
       ${quote(input.suiteId)},
       ${quote(JSON.stringify(input.parameterEnvelope || {}))},
       ${quote(input.parameterEnvelopeHash)},
       ${quote(input.status || "active")},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)}
     );`
  );
}

function getBaselineRenderSetItem(dbPath, baselineRenderSetId, promptKey, stylizeTier) {
  const rows = queryJson(
    dbPath,
    `SELECT item_id, baseline_render_set_id, prompt_key, stylize_tier, grid_image_id, created_at
     FROM baseline_render_set_items
     WHERE baseline_render_set_id = ${quote(baselineRenderSetId)}
       AND prompt_key = ${quote(promptKey)}
       AND stylize_tier = ${Number(stylizeTier)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listBaselineRenderSetItems(dbPath, baselineRenderSetId) {
  return queryJson(
    dbPath,
    `SELECT item_id, baseline_render_set_id, prompt_key, stylize_tier, grid_image_id, created_at
     FROM baseline_render_set_items
     WHERE baseline_render_set_id = ${quote(baselineRenderSetId)}
     ORDER BY prompt_key ASC, stylize_tier ASC;`
  );
}

function insertBaselineRenderSetItem(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO baseline_render_set_items (
       item_id, baseline_render_set_id, prompt_key, stylize_tier, grid_image_id, created_at
     ) VALUES (
       ${quote(input.itemId)},
       ${quote(input.baselineRenderSetId)},
       ${quote(input.promptKey)},
       ${Number(input.stylizeTier)},
       ${quote(input.gridImageId)},
       ${quote(createdAt)}
     );`
  );
}

function upsertBaselineRenderSetItem(dbPath, input) {
  const existing = getBaselineRenderSetItem(
    dbPath,
    input.baselineRenderSetId,
    input.promptKey,
    input.stylizeTier
  );
  if (existing) {
    exec(
      dbPath,
      `UPDATE baseline_render_set_items
       SET grid_image_id = ${quote(input.gridImageId)}
       WHERE item_id = ${quote(existing.item_id)};`
    );
    return getBaselineRenderSetItem(dbPath, input.baselineRenderSetId, input.promptKey, input.stylizeTier);
  }
  insertBaselineRenderSetItem(dbPath, input);
  return getBaselineRenderSetItem(dbPath, input.baselineRenderSetId, input.promptKey, input.stylizeTier);
}

function insertStyleDnaPromptJob(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO style_dna_prompt_jobs (
       prompt_job_id, style_influence_id, baseline_render_set_id, requested_tiers_json,
       status, created_by, created_at
     ) VALUES (
       ${quote(input.promptJobId)},
       ${quote(input.styleInfluenceId)},
       ${quote(input.baselineRenderSetId)},
       ${quote(JSON.stringify(input.requestedTiers || []))},
       ${quote(input.status || "generated")},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)}
     );`
  );
}

function getStyleDnaPromptJobById(dbPath, promptJobId) {
  const rows = queryJson(
    dbPath,
    `SELECT prompt_job_id, style_influence_id, baseline_render_set_id, requested_tiers_json,
            status, created_by, created_at
     FROM style_dna_prompt_jobs
     WHERE prompt_job_id = ${quote(promptJobId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertStyleDnaPromptJobItem(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO style_dna_prompt_job_items (
       item_id, prompt_job_id, prompt_key, stylize_tier, prompt_text_generated, copy_block_order, created_at
     ) VALUES (
       ${quote(input.itemId)},
       ${quote(input.promptJobId)},
       ${quote(input.promptKey)},
       ${Number(input.stylizeTier)},
       ${quote(input.promptTextGenerated)},
       ${Number(input.copyBlockOrder || 0)},
       ${quote(createdAt)}
     );`
  );
}

function listStyleDnaPromptJobItems(dbPath, promptJobId) {
  return queryJson(
    dbPath,
    `SELECT item_id, prompt_job_id, prompt_key, stylize_tier, prompt_text_generated, copy_block_order, created_at
     FROM style_dna_prompt_job_items
     WHERE prompt_job_id = ${quote(promptJobId)}
     ORDER BY copy_block_order ASC, prompt_key ASC;`
  );
}

function getStyleDnaRunById(dbPath, styleDnaRunId) {
  const rows = queryJson(
    dbPath,
    `SELECT style_dna_run_id, idempotency_key, style_influence_id, baseline_render_set_id,
            style_adjustment_type, style_adjustment_midjourney_id, prompt_key,
            stylize_tier, baseline_grid_image_id, test_grid_image_id, analysis_run_id, status,
            last_error_code, last_error_message, created_by, created_at, updated_at
     FROM style_dna_runs
     WHERE style_dna_run_id = ${quote(styleDnaRunId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function getStyleDnaRunByIdempotencyKey(dbPath, idempotencyKey) {
  const rows = queryJson(
    dbPath,
    `SELECT style_dna_run_id, idempotency_key, style_influence_id, baseline_render_set_id,
            style_adjustment_type, style_adjustment_midjourney_id, prompt_key,
            stylize_tier, baseline_grid_image_id, test_grid_image_id, analysis_run_id, status,
            last_error_code, last_error_message, created_by, created_at, updated_at
     FROM style_dna_runs
     WHERE idempotency_key = ${quote(idempotencyKey)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function listStyleDnaRuns(dbPath, input = {}) {
  const where = [];
  if (input.styleInfluenceId) {
    where.push(`style_influence_id = ${quote(input.styleInfluenceId)}`);
  }
  if (input.baselineRenderSetId) {
    where.push(`baseline_render_set_id = ${quote(input.baselineRenderSetId)}`);
  }
  if (input.status) {
    where.push(`status = ${quote(input.status)}`);
  }
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  return queryJson(
    dbPath,
    `SELECT style_dna_run_id, idempotency_key, style_influence_id, baseline_render_set_id,
            style_adjustment_type, style_adjustment_midjourney_id, prompt_key,
            stylize_tier, baseline_grid_image_id, test_grid_image_id, analysis_run_id, status,
            last_error_code, last_error_message, created_by, created_at, updated_at
     FROM style_dna_runs
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT ${Number(input.limit || 100)};`
  );
}

function insertStyleDnaRun(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  const updatedAt = input.updatedAt || createdAt;
  exec(
    dbPath,
    `INSERT INTO style_dna_runs (
       style_dna_run_id, idempotency_key, style_influence_id, baseline_render_set_id,
       style_adjustment_type, style_adjustment_midjourney_id, prompt_key,
       stylize_tier, baseline_grid_image_id, test_grid_image_id, analysis_run_id, status,
       last_error_code, last_error_message, created_by, created_at, updated_at
     ) VALUES (
       ${quote(input.styleDnaRunId)},
       ${quote(input.idempotencyKey)},
       ${quote(input.styleInfluenceId)},
       ${quote(input.baselineRenderSetId)},
       ${quote(input.styleAdjustmentType)},
       ${quote(input.styleAdjustmentMidjourneyId)},
       ${quote(input.promptKey)},
       ${Number(input.stylizeTier)},
       ${quote(input.baselineGridImageId)},
       ${quote(input.testGridImageId)},
       ${quote(input.analysisRunId || null)},
       ${quote(input.status || "queued")},
       ${quote(input.lastErrorCode || null)},
       ${quote(input.lastErrorMessage || null)},
       ${quote(input.createdBy || null)},
       ${quote(createdAt)},
       ${quote(updatedAt)}
     );`
  );
}

function updateStyleDnaRunStatus(dbPath, styleDnaRunId, input) {
  exec(
    dbPath,
    `UPDATE style_dna_runs
     SET
       status = ${quote(input.status)},
       analysis_run_id = COALESCE(${quote(input.analysisRunId || null)}, analysis_run_id),
       last_error_code = ${quote(input.lastErrorCode || null)},
       last_error_message = ${quote(input.lastErrorMessage || null)},
       updated_at = ${quote(nowIso())}
     WHERE style_dna_run_id = ${quote(styleDnaRunId)};`
  );
}

function getStyleDnaRunResultByRunId(dbPath, styleDnaRunId) {
  const rows = queryJson(
    dbPath,
    `SELECT style_dna_run_result_id, style_dna_run_id, llm_raw_json, atomic_traits_json, canonical_traits_json,
            taxonomy_version, summary, created_at
     FROM style_dna_run_results
     WHERE style_dna_run_id = ${quote(styleDnaRunId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertStyleDnaRunResult(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO style_dna_run_results (
       style_dna_run_result_id, style_dna_run_id, llm_raw_json, atomic_traits_json, canonical_traits_json,
       taxonomy_version, summary, created_at
     ) VALUES (
       ${quote(input.styleDnaRunResultId)},
       ${quote(input.styleDnaRunId)},
       ${quote(JSON.stringify(input.llmRaw || {}))},
       ${quote(JSON.stringify(input.atomicTraits || {}))},
       ${quote(JSON.stringify(input.canonicalTraits || {}))},
       ${quote(input.taxonomyVersion || "draft-v1")},
       ${quote(input.summary || null)},
       ${quote(createdAt)}
     );`
  );
}

function getStyleDnaImageById(dbPath, styleDnaImageId) {
  const rows = queryJson(
    dbPath,
    `SELECT style_dna_image_id, image_kind, storage_key, storage_uri, mime_type, file_name, size_bytes, created_by, created_at
     FROM style_dna_images
     WHERE style_dna_image_id = ${quote(styleDnaImageId)}
     LIMIT 1;`
  );
  return rows[0] || null;
}

function insertStyleDnaImage(dbPath, input) {
  const createdAt = input.createdAt || nowIso();
  exec(
    dbPath,
    `INSERT INTO style_dna_images (
       style_dna_image_id, image_kind, storage_key, storage_uri, mime_type, file_name, size_bytes, created_by, created_at
     ) VALUES (
       ${quote(input.styleDnaImageId)},
       ${quote(input.imageKind)},
       ${quote(input.storageKey)},
       ${quote(input.storageUri)},
       ${quote(input.mimeType)},
       ${quote(input.fileName)},
       ${Number(input.sizeBytes)},
       ${quote(input.createdBy)},
       ${quote(createdAt)}
     );`
  );
}

module.exports = {
  ensureReady,
  getUserById,
  insertUser,
  ensureUser,
  updateUserRoleStatus,
  listUsers,
  getJobById,
  getJobByIdempotencyKey,
  insertJob,
  ensureJob,
  updateJobStatus,
  updateJobModerationStatus,
  listRerunJobsByParentJobId,
  getApprovalPolicy,
  upsertApprovalPolicy,
  getNextAttemptCount,
  getLatestAnalysisRunByJobId,
  insertAnalysisRun,
  updateAnalysisRun,
  insertImageTraitAnalysis,
  getImageTraitAnalysisByJobId,
  getStyleInfluenceById,
  getStyleInfluenceTypeByKey,
  getStyleInfluenceTypeById,
  insertStyleInfluenceType,
  ensureStyleInfluenceTypeByKey,
  insertStyleInfluence,
  updateStyleInfluenceGovernance,
  insertAdminActionAudit,
  listAdminActionsAuditByTarget,
  getContributorSubmissionById,
  listContributorSubmissionsByOwnerUserId,
  insertContributorSubmission,
  updateContributorSubmissionStatusAndJob,
  insertContributorSubmissionAction,
  listContributorSubmissionActionsBySubmissionId,
  getRecommendationExtractionById,
  insertRecommendationExtraction,
  markRecommendationExtractionConfirmed,
  getPromptByText,
  getPromptById,
  insertPrompt,
  ensurePromptByText,
  updatePromptCurationStatus,
  getRecommendationSessionByExtractionId,
  getRecommendationSessionById,
  insertRecommendationSession,
  updateRecommendationSessionStatus,
  ensureRecommendationSession,
  insertRecommendation,
  listRecommendationsBySessionId,
  getRecommendationCountBySessionId,
  getRecommendationById,
  insertGeneratedImage,
  getGeneratedImageById,
  insertPostResultFeedback,
  getPostResultFeedbackById,
  listPostResultFeedbackBySessionId,
  insertAlignmentEvaluation,
  getAlignmentEvaluationByFeedbackId,
  listActiveStyleInfluenceCombinations,
  getBaselinePromptSuiteById,
  insertBaselinePromptSuite,
  ensureBaselinePromptSuiteById,
  getBaselinePromptSuiteItemByPromptKey,
  listBaselinePromptSuiteItems,
  insertBaselinePromptSuiteItem,
  ensureBaselinePromptSuiteItemByPromptKey,
  getBaselineRenderSetById,
  getBaselineRenderSetByCompatibility,
  listBaselineRenderSets,
  insertBaselineRenderSet,
  getBaselineRenderSetItem,
  listBaselineRenderSetItems,
  insertBaselineRenderSetItem,
  upsertBaselineRenderSetItem,
  insertStyleDnaPromptJob,
  getStyleDnaPromptJobById,
  insertStyleDnaPromptJobItem,
  listStyleDnaPromptJobItems,
  getStyleDnaRunById,
  getStyleDnaRunByIdempotencyKey,
  listStyleDnaRuns,
  insertStyleDnaRun,
  updateStyleDnaRunStatus,
  getStyleDnaRunResultByRunId,
  insertStyleDnaRunResult,
  getStyleDnaImageById,
  insertStyleDnaImage,
};
