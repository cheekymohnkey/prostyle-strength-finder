const { parseDatabaseUrl, ensureDbParentDir, ensureMigrationsTable, runSql } = require("../../../scripts/db/lib");
const { assertDatabaseReady } = require("../../../scripts/db/runtime");

function quote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function requireEnv(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.trim();
}

function seedRunOpsFixture(dbPath) {
  const now = new Date().toISOString();
  const adminUserId = String(process.env.LOCAL_AUTH_BYPASS_SUBJECT || "frontend-local-user").trim();

  const runFixtures = [
    {
      styleDnaRunId: "sdr_success_001",
      idempotencyKey: "style-dna-playwright-success-001",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_001",
      resultSummary: "Deterministic seeded success run result for Playwright run-operations UI checks.",
    },
    {
      styleDnaRunId: "sdr_faildiag_001",
      idempotencyKey: "style-dna-playwright-faildiag-001",
      status: "failed",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: "PLAYWRIGHT_SIMULATED_FAILURE",
      lastErrorMessage: "Seeded failed run for diagnostics assertions.",
      createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
      hasResult: false,
      resultId: null,
      resultSummary: null,
    },
    {
      styleDnaRunId: "sdr_failmissing_001",
      idempotencyKey: "style-dna-playwright-failmissing-001",
      status: "failed",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "",
      lastErrorCode: "PLAYWRIGHT_MISSING_TEST_GRID",
      lastErrorMessage: "Seeded failed run without test grid reference.",
      createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      hasResult: false,
      resultId: null,
      resultSummary: null,
    },
    {
      styleDnaRunId: "sdr_queue_001",
      idempotencyKey: "style-dna-playwright-queue-001",
      status: "queued",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      hasResult: false,
      resultId: null,
      resultSummary: null,
    },
    {
      styleDnaRunId: "sdr_inprogress_001",
      idempotencyKey: "style-dna-playwright-inprogress-001",
      status: "in_progress",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      hasResult: false,
      resultId: null,
      resultSummary: null,
    },
    {
      styleDnaRunId: "sdr_success_002",
      idempotencyKey: "style-dna-playwright-success-002",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_002",
      resultSummary: "Seeded success result 002.",
    },
    {
      styleDnaRunId: "sdr_success_003",
      idempotencyKey: "style-dna-playwright-success-003",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 7 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_003",
      resultSummary: "Seeded success result 003.",
    },
    {
      styleDnaRunId: "sdr_success_004",
      idempotencyKey: "style-dna-playwright-success-004",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_004",
      resultSummary: "Seeded success result 004.",
    },
    {
      styleDnaRunId: "sdr_success_005",
      idempotencyKey: "style-dna-playwright-success-005",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_005",
      resultSummary: "Seeded success result 005.",
    },
    {
      styleDnaRunId: "sdr_success_006",
      idempotencyKey: "style-dna-playwright-success-006",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_006",
      resultSummary: "Seeded success result 006.",
    },
    {
      styleDnaRunId: "sdr_success_007",
      idempotencyKey: "style-dna-playwright-success-007",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_007",
      resultSummary: "Seeded success result 007.",
    },
    {
      styleDnaRunId: "sdr_success_008",
      idempotencyKey: "style-dna-playwright-success-008",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_008",
      resultSummary: "Seeded success result 008.",
    },
    {
      styleDnaRunId: "sdr_success_009",
      idempotencyKey: "style-dna-playwright-success-009",
      status: "succeeded",
      promptKey: "portrait_primary",
      stylizeTier: 100,
      baselineGridImageId: "sdi_playwright_seed_baseline",
      testGridImageId: "sdi_playwright_seed_test",
      lastErrorCode: null,
      lastErrorMessage: null,
      createdAt: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
      hasResult: true,
      resultId: "sdrr_success_009",
      resultSummary: "Seeded success result 009.",
    },
  ];

  runSql(
    dbPath,
    `
    INSERT INTO users (user_id, role, status, created_at, updated_at)
    VALUES (${quote(adminUserId)}, 'admin', 'active', ${quote(now)}, ${quote(now)})
    ON CONFLICT(user_id) DO UPDATE SET role = 'admin', status = 'active', updated_at = ${quote(now)};

    INSERT INTO style_influence_types (
      style_influence_type_id, type_key, label, parameter_prefix, related_parameter_name, description, enabled_flag
    ) VALUES (
      'sit_playwright_seed',
      'sref_playwright_seed',
      'Sref Playwright Seed',
      '--sref',
      '--stylize',
      'Seeded influence type for deterministic Playwright run operations.',
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
      'si_playwright_seed',
      'sit_playwright_seed',
      'sref-playwright-seed',
      'active',
      0,
      ${quote(adminUserId)},
      ${quote(now)}
    )
    ON CONFLICT(style_influence_id) DO UPDATE SET
      style_influence_type_id = excluded.style_influence_type_id,
      influence_code = excluded.influence_code,
      status = 'active',
      pinned_flag = 0,
      created_by = excluded.created_by,
      created_at = excluded.created_at;

    INSERT INTO baseline_prompt_suites (
      suite_id, name, suite_version, status, created_by, created_at
    ) VALUES (
      'suite_playwright_seed',
      'Playwright Seed Suite',
      'v1',
      'active',
      ${quote(adminUserId)},
      ${quote(now)}
    )
    ON CONFLICT(suite_id) DO UPDATE SET
      name = excluded.name,
      suite_version = excluded.suite_version,
      status = excluded.status,
      created_by = excluded.created_by;

    INSERT INTO baseline_prompt_suite_items (
      item_id, suite_id, prompt_key, prompt_text, display_order, created_at
    ) VALUES (
      'bpsi_playwright_seed',
      'suite_playwright_seed',
      'portrait_primary',
      'a portrait photo, centered subject, neutral background',
      10,
      ${quote(now)}
    )
    ON CONFLICT(item_id) DO UPDATE SET
      suite_id = excluded.suite_id,
      prompt_key = excluded.prompt_key,
      prompt_text = excluded.prompt_text,
      display_order = excluded.display_order;

    INSERT INTO style_dna_images (
      style_dna_image_id, image_kind, storage_key, storage_uri, mime_type, file_name, size_bytes, created_by, created_at
    ) VALUES
    (
      'sdi_playwright_seed_baseline',
      'baseline',
      'style-dna/playwright-seed/baseline.png',
      's3://playwright-seed/style-dna/playwright-seed/baseline.png',
      'image/png',
      'playwright-seed-baseline.png',
      68,
      ${quote(adminUserId)},
      ${quote(now)}
    ),
    (
      'sdi_playwright_seed_test',
      'test',
      'style-dna/playwright-seed/test.png',
      's3://playwright-seed/style-dna/playwright-seed/test.png',
      'image/png',
      'playwright-seed-test.png',
      68,
      ${quote(adminUserId)},
      ${quote(now)}
    )
    ON CONFLICT(style_dna_image_id) DO UPDATE SET
      image_kind = excluded.image_kind,
      storage_key = excluded.storage_key,
      storage_uri = excluded.storage_uri,
      mime_type = excluded.mime_type,
      file_name = excluded.file_name,
      size_bytes = excluded.size_bytes,
      created_by = excluded.created_by,
      created_at = excluded.created_at;

    INSERT INTO baseline_render_sets (
      baseline_render_set_id, mj_model_family, mj_model_version, suite_id,
      parameter_envelope_json, parameter_envelope_hash, status, created_by, created_at
    ) VALUES (
      'brs_playwright_seed',
      'standard',
      '7',
      'suite_playwright_seed',
      '{"aspectRatio":"3:4","styleWeight":0,"stylizeTier":100}',
      'playwright_seed_hash_v1',
      'active',
      ${quote(adminUserId)},
      ${quote(now)}
    )
    ON CONFLICT(baseline_render_set_id) DO UPDATE SET
      mj_model_family = excluded.mj_model_family,
      mj_model_version = excluded.mj_model_version,
      suite_id = excluded.suite_id,
      parameter_envelope_json = excluded.parameter_envelope_json,
      parameter_envelope_hash = excluded.parameter_envelope_hash,
      status = excluded.status,
      created_by = excluded.created_by,
      created_at = excluded.created_at;

    INSERT INTO baseline_render_set_items (
      item_id, baseline_render_set_id, prompt_key, stylize_tier, grid_image_id, created_at
    ) VALUES (
      'brsi_playwright_seed',
      'brs_playwright_seed',
      'portrait_primary',
      100,
      'sdi_playwright_seed_baseline',
      ${quote(now)}
    )
    ON CONFLICT(item_id) DO UPDATE SET
      baseline_render_set_id = excluded.baseline_render_set_id,
      prompt_key = excluded.prompt_key,
      stylize_tier = excluded.stylize_tier,
      grid_image_id = excluded.grid_image_id,
      created_at = excluded.created_at;

    ${runFixtures.map((fixture) => `
    INSERT INTO style_dna_runs (
      style_dna_run_id, idempotency_key, style_influence_id, baseline_render_set_id,
      style_adjustment_type, style_adjustment_midjourney_id, prompt_key, stylize_tier,
      baseline_grid_image_id, test_grid_image_id, analysis_run_id, status,
      last_error_code, last_error_message, created_by, created_at, updated_at
    ) VALUES (
      ${quote(fixture.styleDnaRunId)},
      ${quote(fixture.idempotencyKey)},
      'si_playwright_seed',
      'brs_playwright_seed',
      'sref',
      'sref-playwright-seed',
      ${quote(fixture.promptKey)},
      ${Number(fixture.stylizeTier)},
      ${quote(fixture.baselineGridImageId)},
      ${quote(fixture.testGridImageId)},
      NULL,
      ${quote(fixture.status)},
      ${quote(fixture.lastErrorCode)},
      ${quote(fixture.lastErrorMessage)},
      ${quote(adminUserId)},
      ${quote(fixture.createdAt)},
      ${quote(fixture.createdAt)}
    )
    ON CONFLICT(style_dna_run_id) DO UPDATE SET
      idempotency_key = excluded.idempotency_key,
      style_influence_id = excluded.style_influence_id,
      baseline_render_set_id = excluded.baseline_render_set_id,
      style_adjustment_type = excluded.style_adjustment_type,
      style_adjustment_midjourney_id = excluded.style_adjustment_midjourney_id,
      prompt_key = excluded.prompt_key,
      stylize_tier = excluded.stylize_tier,
      baseline_grid_image_id = excluded.baseline_grid_image_id,
      test_grid_image_id = excluded.test_grid_image_id,
      analysis_run_id = excluded.analysis_run_id,
      status = excluded.status,
      last_error_code = excluded.last_error_code,
      last_error_message = excluded.last_error_message,
      created_by = excluded.created_by,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;
    `).join("\n")}

    ${runFixtures.filter((fixture) => fixture.hasResult).map((fixture) => `
    INSERT INTO style_dna_run_results (
      style_dna_run_result_id, style_dna_run_id, llm_raw_json, atomic_traits_json, canonical_traits_json,
      taxonomy_version, summary, created_at
    ) VALUES (
      ${quote(fixture.resultId)},
      ${quote(fixture.styleDnaRunId)},
      '{"source":"playwright-seed"}',
      '{"vibe_shift":"clean, editorial, polished"}',
      '{"aesthetic":["minimal"],"mood":["confident"]}',
      'style_dna_v1',
      ${quote(fixture.resultSummary)},
      ${quote(fixture.createdAt)}
    )
    ON CONFLICT(style_dna_run_result_id) DO UPDATE SET
      style_dna_run_id = excluded.style_dna_run_id,
      llm_raw_json = excluded.llm_raw_json,
      atomic_traits_json = excluded.atomic_traits_json,
      canonical_traits_json = excluded.canonical_traits_json,
      taxonomy_version = excluded.taxonomy_version,
      summary = excluded.summary,
      created_at = excluded.created_at;
    `).join("\n")}
    `
  );

  return {
    adminUserId,
    styleInfluenceId: "si_playwright_seed",
    styleDnaRunId: "sdr_success_001",
    failedRunId: "sdr_faildiag_001",
    retryDisabledRunId: "sdr_failmissing_001",
    runCount: runFixtures.length,
  };
}

function main() {
  const databaseUrl = requireEnv("DATABASE_URL");
  const dbPath = parseDatabaseUrl(databaseUrl);
  ensureDbParentDir(dbPath);
  ensureMigrationsTable(dbPath);
  assertDatabaseReady(databaseUrl);

  const seeded = seedRunOpsFixture(dbPath);

  console.log(JSON.stringify({
    ok: true,
    fixture: seeded,
  }, null, 2));
}

main();
