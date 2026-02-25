const { spawn } = require("child_process");
const crypto = require("crypto");
const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../db/lib");
const { assertDatabaseReady } = require("../db/runtime");

const ONE_PIXEL_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9VE6zJkAAAAASUVORK5CYII=";

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function buildToken(sub) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlJson({ alg: "none", typ: "JWT" });
  const payload = base64UrlJson({
    iss: process.env.COGNITO_ISSUER,
    aud: process.env.COGNITO_AUDIENCE,
    sub,
    exp: now + 3600,
  });
  return `${header}.${payload}.sig`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl, token) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (response.ok) {
        return;
      }
    } catch (_error) {
      // API not ready yet.
    }
    await sleep(200);
  }
  throw new Error("API healthcheck did not become ready in time");
}

async function requestJson(url, options, expectedStatus) {
  const response = await fetch(url, options);
  const json = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) {
    throw new Error(`Expected ${expectedStatus} for ${options.method || "GET"} ${url}, got ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function queryJson(dbPath, sql) {
  const output = runSql(dbPath, sql, { json: true });
  if (!output) {
    return [];
  }
  return JSON.parse(output);
}

function seedPrereqs(dbPath) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES ('admin-style-dna-delete-cascade-smoke-user', 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_style_dna_delete_cascade_smoke',
      'profile_style_dna_delete_cascade_smoke',
      'Style-DNA Delete Cascade Smoke',
      '--profile',
      '--stylize',
      'Style-DNA baseline delete cascade smoke type',
      1
    )
    ON CONFLICT(type_key) DO UPDATE SET
      style_influence_type_id = excluded.style_influence_type_id,
      label = excluded.label,
      parameter_prefix = excluded.parameter_prefix,
      related_parameter_name = excluded.related_parameter_name,
      description = excluded.description,
      enabled_flag = excluded.enabled_flag;

    INSERT INTO style_influences (
      style_influence_id, style_influence_type_id, influence_code, status, pinned_flag, created_by, created_at
    ) VALUES (
      'si_style_dna_delete_cascade_smoke',
      'sit_style_dna_delete_cascade_smoke',
      'profile-style-dna-delete-cascade-smoke',
      'active',
      0,
      'admin-style-dna-delete-cascade-smoke-user',
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET
      style_influence_type_id = excluded.style_influence_type_id,
      influence_code = excluded.influence_code,
      status = 'active',
      pinned_flag = 0,
      created_by = 'admin-style-dna-delete-cascade-smoke-user',
      created_at = ${quote(now)};
    `
  );
}

function seedCascadeDependencies(dbPath, input) {
  const now = new Date().toISOString();
  runSql(
    dbPath,
    `
    INSERT INTO style_dna_prompt_jobs (
      prompt_job_id, style_influence_id, baseline_render_set_id, requested_tiers_json,
      status, created_by, created_at
    ) VALUES (
      ${quote(input.promptJobId)},
      'si_style_dna_delete_cascade_smoke',
      ${quote(input.baselineRenderSetId)},
      '[0]',
      'generated',
      'admin-style-dna-delete-cascade-smoke-user',
      ${quote(now)}
    );

    INSERT INTO style_dna_prompt_job_items (
      item_id, prompt_job_id, prompt_key, stylize_tier, prompt_text_generated, copy_block_order, created_at
    ) VALUES (
      ${quote(input.promptJobItemId)},
      ${quote(input.promptJobId)},
      'person_camera_16_9',
      0,
      'smoke generated prompt',
      1,
      ${quote(now)}
    );

    INSERT INTO analysis_jobs (
      job_id, idempotency_key, run_type, image_id, status, submitted_at, updated_at,
      model_family, model_version, model_selection_source, moderation_status, rerun_of_job_id
    ) VALUES (
      ${quote(input.analysisJobId)},
      ${quote(`style-dna-delete-cascade-smoke-${Date.now()}`)},
      'style_dna',
      ${quote(input.testImageId)},
      'succeeded',
      ${quote(now)},
      ${quote(now)},
      'standard',
      '7',
      'default',
      'none',
      NULL
    );

    INSERT INTO analysis_runs (
      analysis_run_id, job_id, status, attempt_count, started_at, completed_at,
      last_error_code, last_error_message, model_family, model_version
    ) VALUES (
      ${quote(input.analysisRunId)},
      ${quote(input.analysisJobId)},
      'succeeded',
      1,
      ${quote(now)},
      ${quote(now)},
      NULL,
      NULL,
      'standard',
      '7'
    );

    INSERT INTO style_dna_runs (
      style_dna_run_id, idempotency_key, style_influence_id, baseline_render_set_id,
      style_adjustment_type, style_adjustment_midjourney_id, prompt_key,
      stylize_tier, baseline_grid_image_id, test_grid_image_id, analysis_run_id,
      status, last_error_code, last_error_message, created_by, created_at, updated_at
    ) VALUES (
      ${quote(input.styleDnaRunId)},
      ${quote(`style-dna-run-delete-cascade-smoke-${Date.now()}`)},
      'si_style_dna_delete_cascade_smoke',
      ${quote(input.baselineRenderSetId)},
      'profile',
      'profile-style-dna-delete-cascade-smoke',
      'person_camera_16_9',
      0,
      ${quote(input.baselineImageId)},
      ${quote(input.testImageId)},
      ${quote(input.analysisRunId)},
      'succeeded',
      NULL,
      NULL,
      'admin-style-dna-delete-cascade-smoke-user',
      ${quote(now)},
      ${quote(now)}
    );

    INSERT INTO style_dna_run_results (
      style_dna_run_result_id, style_dna_run_id, llm_raw_json, atomic_traits_json,
      canonical_traits_json, taxonomy_version, summary, created_at
    ) VALUES (
      ${quote(input.styleDnaRunResultId)},
      ${quote(input.styleDnaRunId)},
      '{"raw":"ok"}',
      '{"composition_and_structure":["balance"]}',
      '{"composition_and_structure":["balanced composition"]}',
      'v1',
      'smoke summary',
      ${quote(now)}
    );

    INSERT INTO image_trait_analyses (
      image_trait_analysis_id, analysis_run_id, job_id, image_id, trait_schema_version,
      trait_vector_json, evidence_summary, created_at
    ) VALUES (
      ${quote(input.imageTraitAnalysisId)},
      ${quote(input.analysisRunId)},
      ${quote(input.analysisJobId)},
      ${quote(input.testImageId)},
      'v1',
      '{"composition_and_structure":["balance"]}',
      'smoke evidence',
      ${quote(now)}
    );

    INSERT INTO style_dna_trait_discoveries (
      discovery_id, taxonomy_version, axis, raw_trait_text, normalized_trait,
      status, first_seen_at, last_seen_at, seen_count,
      latest_style_dna_run_id, latest_analysis_run_id, top_candidates_json, resolution_payload_json
    ) VALUES (
      ${quote(input.discoveryId)},
      'v1',
      'composition_and_structure',
      'Balanced Composition',
      'balanced composition',
      'pending_review',
      ${quote(now)},
      ${quote(now)},
      1,
      ${quote(input.styleDnaRunId)},
      ${quote(input.analysisRunId)},
      '[]',
      NULL
    )
    ON CONFLICT(discovery_id) DO UPDATE SET
      latest_style_dna_run_id = excluded.latest_style_dna_run_id,
      latest_analysis_run_id = excluded.latest_analysis_run_id,
      last_seen_at = excluded.last_seen_at,
      seen_count = excluded.seen_count;

    INSERT INTO admin_actions_audit (
      admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
    ) VALUES (
      ${quote(input.auditBaselineId)},
      'admin-style-dna-delete-cascade-smoke-user',
      'style_dna.baseline_set.seed',
      'style_dna_baseline_set',
      ${quote(input.baselineRenderSetId)},
      'seed baseline audit',
      ${quote(now)}
    );

    INSERT INTO admin_actions_audit (
      admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
    ) VALUES (
      ${quote(input.auditPromptJobId)},
      'admin-style-dna-delete-cascade-smoke-user',
      'style_dna.prompt_job.seed',
      'style_dna_prompt_job',
      ${quote(input.promptJobId)},
      'seed prompt job audit',
      ${quote(now)}
    );

    INSERT INTO admin_actions_audit (
      admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
    ) VALUES (
      ${quote(input.auditRunId)},
      'admin-style-dna-delete-cascade-smoke-user',
      'style_dna.run.seed',
      'style_dna_run',
      ${quote(input.styleDnaRunId)},
      'seed run audit',
      ${quote(now)}
    );

    INSERT INTO admin_actions_audit (
      admin_action_audit_id, admin_user_id, action_type, target_type, target_id, reason, created_at
    ) VALUES (
      ${quote(input.auditUnrelatedId)},
      'admin-style-dna-delete-cascade-smoke-user',
      'style_dna.unrelated.seed',
      'style_dna_baseline_set',
      'baseline_set_unrelated_smoke',
      'seed unrelated audit',
      ${quote(now)}
    );
    `
  );
}

function getCounts(dbPath, input) {
  const rows = queryJson(
    dbPath,
    `SELECT
      (SELECT COUNT(*) FROM baseline_render_sets WHERE baseline_render_set_id = ${quote(input.baselineRenderSetId)}) AS baseline_set_count,
      (SELECT COUNT(*) FROM baseline_render_set_items WHERE baseline_render_set_id = ${quote(input.baselineRenderSetId)}) AS baseline_item_count,
      (SELECT COUNT(*) FROM style_dna_prompt_jobs WHERE baseline_render_set_id = ${quote(input.baselineRenderSetId)}) AS prompt_job_count,
      (SELECT COUNT(*) FROM style_dna_prompt_job_items WHERE prompt_job_id = ${quote(input.promptJobId)}) AS prompt_job_item_count,
      (SELECT COUNT(*) FROM style_dna_runs WHERE baseline_render_set_id = ${quote(input.baselineRenderSetId)}) AS style_dna_run_count,
      (SELECT COUNT(*) FROM style_dna_run_results WHERE style_dna_run_id = ${quote(input.styleDnaRunId)}) AS style_dna_run_result_count,
      (SELECT COUNT(*) FROM analysis_runs WHERE analysis_run_id = ${quote(input.analysisRunId)}) AS analysis_run_count,
      (SELECT COUNT(*) FROM analysis_jobs WHERE job_id = ${quote(input.analysisJobId)}) AS analysis_job_count,
      (SELECT COUNT(*) FROM image_trait_analyses WHERE analysis_run_id = ${quote(input.analysisRunId)}) AS image_trait_analysis_count,
      (SELECT COUNT(*) FROM style_dna_images WHERE style_dna_image_id IN (${quote(input.baselineImageId)}, ${quote(input.testImageId)})) AS style_dna_image_count,
      (SELECT COUNT(*) FROM baseline_prompt_suites WHERE suite_id = ${quote(input.suiteId)}) AS suite_count,
      (SELECT COUNT(*) FROM baseline_prompt_suite_items WHERE suite_id = ${quote(input.suiteId)}) AS suite_item_count,
      (SELECT COUNT(*) FROM baseline_prompt_suite_item_metadata WHERE suite_id = ${quote(input.suiteId)}) AS suite_metadata_count,
      (SELECT COUNT(*) FROM style_dna_trait_discoveries
        WHERE discovery_id = ${quote(input.discoveryId)}
          AND latest_style_dna_run_id IS NULL
          AND latest_analysis_run_id IS NULL) AS discovery_pointer_cleared_count,
      (SELECT COUNT(*) FROM admin_actions_audit
        WHERE target_type = 'style_dna_baseline_set' AND target_id = ${quote(input.baselineRenderSetId)}) AS baseline_target_audit_count,
      (SELECT COUNT(*) FROM admin_actions_audit
        WHERE target_type = 'style_dna_prompt_job' AND target_id = ${quote(input.promptJobId)}) AS prompt_job_target_audit_count,
      (SELECT COUNT(*) FROM admin_actions_audit
        WHERE target_type = 'style_dna_run' AND target_id = ${quote(input.styleDnaRunId)}) AS run_target_audit_count,
      (SELECT COUNT(*) FROM admin_actions_audit
        WHERE admin_action_audit_id = ${quote(input.auditUnrelatedId)}) AS unrelated_audit_count,
      (SELECT COUNT(*) FROM admin_actions_audit
        WHERE target_type = 'style_dna_baseline_set'
          AND target_id = ${quote(input.baselineRenderSetId)}
          AND action_type = 'style_dna.baseline_set.delete') AS delete_audit_count;
    `
  );
  return rows[0] || {};
}

function cleanupSmokeData(dbPath, input) {
  runSql(
    dbPath,
    `
    DELETE FROM style_dna_run_results WHERE style_dna_run_id = ${quote(input.styleDnaRunId)};
    DELETE FROM style_dna_runs WHERE style_dna_run_id = ${quote(input.styleDnaRunId)};
    DELETE FROM image_trait_analyses WHERE image_trait_analysis_id = ${quote(input.imageTraitAnalysisId)};
    DELETE FROM analysis_runs WHERE analysis_run_id = ${quote(input.analysisRunId)};
    DELETE FROM analysis_jobs WHERE job_id = ${quote(input.analysisJobId)};
    DELETE FROM style_dna_prompt_job_items WHERE prompt_job_id = ${quote(input.promptJobId)};
    DELETE FROM style_dna_prompt_jobs WHERE prompt_job_id = ${quote(input.promptJobId)};
    DELETE FROM baseline_render_set_items WHERE baseline_render_set_id = ${quote(input.baselineRenderSetId)};
    DELETE FROM baseline_render_sets WHERE baseline_render_set_id = ${quote(input.baselineRenderSetId)};
    DELETE FROM baseline_prompt_suite_item_metadata WHERE suite_id = ${quote(input.suiteId)};
    DELETE FROM baseline_prompt_suite_items WHERE suite_id = ${quote(input.suiteId)};
    DELETE FROM baseline_prompt_suites WHERE suite_id = ${quote(input.suiteId)};
    DELETE FROM style_dna_images WHERE style_dna_image_id IN (${quote(input.baselineImageId)}, ${quote(input.testImageId)});
    DELETE FROM admin_actions_audit WHERE admin_action_audit_id IN (
      ${quote(input.auditBaselineId)},
      ${quote(input.auditPromptJobId)},
      ${quote(input.auditRunId)},
      ${quote(input.auditUnrelatedId)}
    );
    `
  );
}

async function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  requireEnv("COGNITO_ISSUER");
  requireEnv("COGNITO_AUDIENCE");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);
  seedPrereqs(dbPath);

  const adminUserId = "admin-style-dna-delete-cascade-smoke-user";
  const adminToken = buildToken(adminUserId);
  const smokePort = process.env.SMOKE_API_PORT || "3027";
  const baseUrl = `http://127.0.0.1:${smokePort}/v1`;
  const ids = {
    suiteId: `suite_style_dna_delete_cascade_smoke_${Date.now()}`,
    baselineRenderSetId: "",
    baselineImageId: "",
    testImageId: "",
    promptJobId: `sdpj_${crypto.randomUUID()}`,
    promptJobItemId: `sdpji_${crypto.randomUUID()}`,
    styleDnaRunId: `sdr_${crypto.randomUUID()}`,
    styleDnaRunResultId: `sdrr_${crypto.randomUUID()}`,
    analysisRunId: `ar_${crypto.randomUUID()}`,
    analysisJobId: `aj_${crypto.randomUUID()}`,
    imageTraitAnalysisId: `ita_${crypto.randomUUID()}`,
    discoveryId: `sdd_${crypto.randomUUID()}`,
    auditBaselineId: `aud_${crypto.randomUUID()}`,
    auditPromptJobId: `aud_${crypto.randomUUID()}`,
    auditRunId: `aud_${crypto.randomUUID()}`,
    auditUnrelatedId: `aud_${crypto.randomUUID()}`,
  };

  const apiProc = spawn("node", ["apps/api/src/index.js"], {
    env: {
      ...process.env,
      PORT: smokePort,
      TRAIT_INFERENCE_MODE: process.env.TRAIT_INFERENCE_MODE || "deterministic",
      STYLE_DNA_INFERENCE_MODE: process.env.STYLE_DNA_INFERENCE_MODE || "deterministic",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let apiStderr = "";
  apiProc.stderr.on("data", (chunk) => {
    apiStderr += chunk.toString("utf8");
  });

  let cleanupVerified = false;

  try {
    await waitForHealth(baseUrl, adminToken);

    const baselineImage = await requestJson(
      `${baseUrl}/admin/style-dna/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "baseline",
          fileName: "baseline-delete-cascade-smoke-baseline.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );
    const testImage = await requestJson(
      `${baseUrl}/admin/style-dna/images`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          imageKind: "test",
          fileName: "baseline-delete-cascade-smoke-test.png",
          mimeType: "image/png",
          fileBase64: ONE_PIXEL_PNG_BASE64,
        }),
      },
      201
    );

    ids.baselineImageId = String(baselineImage?.image?.styleDnaImageId || "");
    ids.testImageId = String(testImage?.image?.styleDnaImageId || "");
    assertCondition(ids.baselineImageId !== "", "Missing baseline image id");
    assertCondition(ids.testImageId !== "", "Missing test image id");

    const createBaselineSet = await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          mjModelFamily: "standard",
          mjModelVersion: "7",
          suiteId: ids.suiteId,
          parameterEnvelope: {
            aspectRatio: "16:9",
            seed: 888,
            styleRaw: true,
            stylizeTier: 0,
            styleWeight: 0,
          },
        }),
      },
      201
    );
    ids.baselineRenderSetId = String(createBaselineSet?.baselineRenderSet?.baselineRenderSetId || "");
    assertCondition(ids.baselineRenderSetId !== "", "Missing baseline render set id");

    await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets/${ids.baselineRenderSetId}/items`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          promptKey: "person_camera_16_9",
          stylizeTier: 0,
          gridImageId: ids.baselineImageId,
        }),
      },
      200
    );

    seedCascadeDependencies(dbPath, ids);

    const deleted = await requestJson(
      `${baseUrl}/admin/style-dna/baseline-sets/${ids.baselineRenderSetId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
      200
    );

    assertCondition(deleted?.deleted === true, "Expected delete endpoint to return deleted=true");
    assertCondition(deleted?.baselineRenderSetId === ids.baselineRenderSetId, "Delete response baseline id mismatch");
    assertCondition(deleted?.suiteId === ids.suiteId, "Delete response suite id mismatch");
    assertCondition(deleted?.suiteDeleted === true, "Expected suiteDeleted=true");

    const summary = deleted?.cascadeSummary || {};
    assertCondition(summary.baselineItemCount === 1, `Expected baselineItemCount=1, got ${summary.baselineItemCount}`);
    assertCondition(summary.promptJobCount === 1, `Expected promptJobCount=1, got ${summary.promptJobCount}`);
    assertCondition(summary.promptJobItemCount === 1, `Expected promptJobItemCount=1, got ${summary.promptJobItemCount}`);
    assertCondition(summary.styleDnaRunCount === 1, `Expected styleDnaRunCount=1, got ${summary.styleDnaRunCount}`);
    assertCondition(summary.styleDnaRunResultCount === 1, `Expected styleDnaRunResultCount=1, got ${summary.styleDnaRunResultCount}`);
    assertCondition(summary.analysisRunCount === 1, `Expected analysisRunCount=1, got ${summary.analysisRunCount}`);
    assertCondition(summary.analysisJobCount === 1, `Expected analysisJobCount=1, got ${summary.analysisJobCount}`);
    assertCondition(summary.imageTraitAnalysisCount === 1, `Expected imageTraitAnalysisCount=1, got ${summary.imageTraitAnalysisCount}`);
    assertCondition(summary.candidateImageCount === 2, `Expected candidateImageCount=2, got ${summary.candidateImageCount}`);
    assertCondition(summary.deletedImageCount === 2, `Expected deletedImageCount=2, got ${summary.deletedImageCount}`);

    assertCondition(deleted?.storageCleanup?.failedObjectCount === 0, "Expected zero storage cleanup failures");
    assertCondition(deleted?.storageCleanup?.deletedObjectCount === 2, "Expected two deleted storage objects");

    const getAfterDelete = await fetch(`${baseUrl}/admin/style-dna/baseline-sets/${ids.baselineRenderSetId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });
    assertCondition(getAfterDelete.status === 404, `Expected 404 after delete, got ${getAfterDelete.status}`);

    const postDeleteCounts = getCounts(dbPath, ids);
    assertCondition(Number(postDeleteCounts.baseline_set_count || 0) === 0, "Expected baseline set deleted");
    assertCondition(Number(postDeleteCounts.baseline_item_count || 0) === 0, "Expected baseline set items deleted");
    assertCondition(Number(postDeleteCounts.prompt_job_count || 0) === 0, "Expected prompt jobs deleted");
    assertCondition(Number(postDeleteCounts.prompt_job_item_count || 0) === 0, "Expected prompt job items deleted");
    assertCondition(Number(postDeleteCounts.style_dna_run_count || 0) === 0, "Expected style-dna runs deleted");
    assertCondition(Number(postDeleteCounts.style_dna_run_result_count || 0) === 0, "Expected style-dna run results deleted");
    assertCondition(Number(postDeleteCounts.analysis_run_count || 0) === 0, "Expected analysis runs deleted");
    assertCondition(Number(postDeleteCounts.analysis_job_count || 0) === 0, "Expected style-dna analysis jobs deleted");
    assertCondition(Number(postDeleteCounts.image_trait_analysis_count || 0) === 0, "Expected image trait analyses deleted");
    assertCondition(Number(postDeleteCounts.style_dna_image_count || 0) === 0, "Expected orphan style-dna images deleted");
    assertCondition(Number(postDeleteCounts.suite_count || 0) === 0, "Expected suite deleted");
    assertCondition(Number(postDeleteCounts.suite_item_count || 0) === 0, "Expected suite items deleted");
    assertCondition(Number(postDeleteCounts.suite_metadata_count || 0) === 0, "Expected suite metadata deleted");
    assertCondition(Number(postDeleteCounts.discovery_pointer_cleared_count || 0) === 1, "Expected discovery pointers cleared");
    assertCondition(Number(postDeleteCounts.prompt_job_target_audit_count || 0) === 0, "Expected prompt-job audit entries deleted");
    assertCondition(Number(postDeleteCounts.run_target_audit_count || 0) === 0, "Expected run audit entries deleted");
    assertCondition(Number(postDeleteCounts.unrelated_audit_count || 0) === 1, "Expected unrelated audit entry retained");
    assertCondition(Number(postDeleteCounts.delete_audit_count || 0) === 1, "Expected one delete audit entry");
    assertCondition(Number(postDeleteCounts.baseline_target_audit_count || 0) === 1, "Expected one baseline target audit after delete");

    cleanupVerified = true;

    console.log(
      JSON.stringify(
        {
          ok: true,
          smokePort,
          baselineRenderSetId: ids.baselineRenderSetId,
          suiteId: ids.suiteId,
          cascadeSummary: summary,
          storageCleanup: deleted.storageCleanup,
        },
        null,
        2
      )
    );
  } finally {
    if (!cleanupVerified) {
      cleanupSmokeData(dbPath, ids);
    }
    apiProc.kill("SIGTERM");
    await sleep(200);
    if (!apiProc.killed) {
      apiProc.kill("SIGKILL");
    }
    if (apiStderr.trim() !== "") {
      process.stderr.write(apiStderr);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});