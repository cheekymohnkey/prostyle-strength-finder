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

    INSERT INTO style_dna_runs (
      style_dna_run_id, idempotency_key, style_influence_id, baseline_render_set_id,
      style_adjustment_type, style_adjustment_midjourney_id, prompt_key, stylize_tier,
      baseline_grid_image_id, test_grid_image_id, analysis_run_id, status,
      last_error_code, last_error_message, created_by, created_at, updated_at
    ) VALUES (
      'sdr_playwright_seed',
      'style-dna-playwright-seed-idem-v1',
      'si_playwright_seed',
      'brs_playwright_seed',
      'sref',
      'sref-playwright-seed',
      'portrait_primary',
      100,
      'sdi_playwright_seed_baseline',
      'sdi_playwright_seed_test',
      NULL,
      'succeeded',
      NULL,
      NULL,
      ${quote(adminUserId)},
      ${quote(now)},
      ${quote(now)}
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
      last_error_code = NULL,
      last_error_message = NULL,
      created_by = excluded.created_by,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at;

    INSERT INTO style_dna_run_results (
      style_dna_run_result_id, style_dna_run_id, llm_raw_json, atomic_traits_json, canonical_traits_json,
      taxonomy_version, summary, created_at
    ) VALUES (
      'sdrr_playwright_seed',
      'sdr_playwright_seed',
      '{"source":"playwright-seed"}',
      '{"vibe_shift":"clean, editorial, polished"}',
      '{"aesthetic":["minimal"],"mood":["confident"]}',
      'style_dna_v1',
      'Deterministic seeded run result for Playwright run-operations UI checks.',
      ${quote(now)}
    )
    ON CONFLICT(style_dna_run_result_id) DO UPDATE SET
      style_dna_run_id = excluded.style_dna_run_id,
      llm_raw_json = excluded.llm_raw_json,
      atomic_traits_json = excluded.atomic_traits_json,
      canonical_traits_json = excluded.canonical_traits_json,
      taxonomy_version = excluded.taxonomy_version,
      summary = excluded.summary,
      created_at = excluded.created_at;
    `
  );

  return {
    adminUserId,
    styleInfluenceId: "si_playwright_seed",
    styleDnaRunId: "sdr_playwright_seed",
    status: "succeeded",
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
