-- migrate:up

CREATE TABLE IF NOT EXISTS baseline_prompt_suites (
  suite_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  suite_version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  CHECK (status IN ('active', 'deprecated'))
);

CREATE TABLE IF NOT EXISTS baseline_prompt_suite_items (
  item_id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (suite_id) REFERENCES baseline_prompt_suites(suite_id),
  UNIQUE (suite_id, prompt_key)
);

CREATE TABLE IF NOT EXISTS baseline_render_sets (
  baseline_render_set_id TEXT PRIMARY KEY,
  mj_model_family TEXT NOT NULL,
  mj_model_version TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  parameter_envelope_json TEXT NOT NULL,
  parameter_envelope_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (suite_id) REFERENCES baseline_prompt_suites(suite_id),
  CHECK (status IN ('draft', 'active', 'deprecated')),
  UNIQUE (mj_model_family, mj_model_version, suite_id, parameter_envelope_hash)
);

CREATE TABLE IF NOT EXISTS baseline_render_set_items (
  item_id TEXT PRIMARY KEY,
  baseline_render_set_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  stylize_tier INTEGER NOT NULL,
  grid_image_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (baseline_render_set_id) REFERENCES baseline_render_sets(baseline_render_set_id),
  UNIQUE (baseline_render_set_id, prompt_key, stylize_tier)
);

CREATE TABLE IF NOT EXISTS style_dna_prompt_jobs (
  prompt_job_id TEXT PRIMARY KEY,
  style_influence_id TEXT NOT NULL,
  baseline_render_set_id TEXT NOT NULL,
  requested_tiers_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (style_influence_id) REFERENCES style_influences(style_influence_id),
  FOREIGN KEY (baseline_render_set_id) REFERENCES baseline_render_sets(baseline_render_set_id),
  CHECK (status IN ('generated', 'deprecated'))
);

CREATE TABLE IF NOT EXISTS style_dna_prompt_job_items (
  item_id TEXT PRIMARY KEY,
  prompt_job_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  stylize_tier INTEGER NOT NULL,
  prompt_text_generated TEXT NOT NULL,
  copy_block_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (prompt_job_id) REFERENCES style_dna_prompt_jobs(prompt_job_id)
);

CREATE TABLE IF NOT EXISTS style_dna_runs (
  style_dna_run_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  style_influence_id TEXT NOT NULL,
  baseline_render_set_id TEXT NOT NULL,
  style_adjustment_type TEXT NOT NULL,
  style_adjustment_midjourney_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  stylize_tier INTEGER NOT NULL,
  baseline_grid_image_id TEXT NOT NULL,
  test_grid_image_id TEXT NOT NULL,
  analysis_run_id TEXT,
  status TEXT NOT NULL,
  last_error_code TEXT,
  last_error_message TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (style_influence_id) REFERENCES style_influences(style_influence_id),
  FOREIGN KEY (baseline_render_set_id) REFERENCES baseline_render_sets(baseline_render_set_id),
  FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(analysis_run_id),
  CHECK (status IN ('queued', 'in_progress', 'succeeded', 'failed', 'dead_letter')),
  CHECK (style_adjustment_type IN ('sref', 'profile'))
);

CREATE TABLE IF NOT EXISTS style_dna_images (
  style_dna_image_id TEXT PRIMARY KEY,
  image_kind TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  storage_uri TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (image_kind IN ('baseline', 'test'))
);

CREATE TABLE IF NOT EXISTS style_dna_run_results (
  style_dna_run_result_id TEXT PRIMARY KEY,
  style_dna_run_id TEXT NOT NULL UNIQUE,
  llm_raw_json TEXT NOT NULL,
  atomic_traits_json TEXT NOT NULL,
  canonical_traits_json TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (style_dna_run_id) REFERENCES style_dna_runs(style_dna_run_id)
);

CREATE INDEX IF NOT EXISTS idx_baseline_render_sets_compat
  ON baseline_render_sets(mj_model_family, mj_model_version, parameter_envelope_hash);

CREATE INDEX IF NOT EXISTS idx_baseline_render_set_items_lookup
  ON baseline_render_set_items(baseline_render_set_id, prompt_key, stylize_tier);

CREATE INDEX IF NOT EXISTS idx_style_dna_prompt_jobs_lookup
  ON style_dna_prompt_jobs(style_influence_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_style_dna_runs_status_created
  ON style_dna_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_style_dna_images_kind_created
  ON style_dna_images(image_kind, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_style_dna_runs_status_created;
DROP INDEX IF EXISTS idx_style_dna_images_kind_created;
DROP INDEX IF EXISTS idx_style_dna_prompt_jobs_lookup;
DROP INDEX IF EXISTS idx_baseline_render_set_items_lookup;
DROP INDEX IF EXISTS idx_baseline_render_sets_compat;
DROP TABLE IF EXISTS style_dna_images;
DROP TABLE IF EXISTS style_dna_run_results;
DROP TABLE IF EXISTS style_dna_runs;
DROP TABLE IF EXISTS style_dna_prompt_job_items;
DROP TABLE IF EXISTS style_dna_prompt_jobs;
DROP TABLE IF EXISTS baseline_render_set_items;
DROP TABLE IF EXISTS baseline_render_sets;
DROP TABLE IF EXISTS baseline_prompt_suite_items;
DROP TABLE IF EXISTS baseline_prompt_suites;
