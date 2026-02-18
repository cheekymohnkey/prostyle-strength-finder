-- migrate:up

ALTER TABLE analysis_jobs ADD COLUMN model_family TEXT;
ALTER TABLE analysis_jobs ADD COLUMN model_version TEXT;
ALTER TABLE analysis_jobs ADD COLUMN model_selection_source TEXT;

ALTER TABLE analysis_runs ADD COLUMN model_family TEXT;
ALTER TABLE analysis_runs ADD COLUMN model_version TEXT;

UPDATE analysis_jobs
SET model_family = 'standard'
WHERE model_family IS NULL OR TRIM(model_family) = '';

UPDATE analysis_jobs
SET model_version = '7'
WHERE model_version IS NULL OR TRIM(model_version) = '';

UPDATE analysis_jobs
SET model_selection_source = 'legacy_default_standard_v7'
WHERE model_selection_source IS NULL OR TRIM(model_selection_source) = '';

UPDATE analysis_runs
SET model_family = 'standard'
WHERE model_family IS NULL OR TRIM(model_family) = '';

UPDATE analysis_runs
SET model_version = '7'
WHERE model_version IS NULL OR TRIM(model_version) = '';

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_model ON analysis_jobs(model_family, model_version);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_model ON analysis_runs(model_family, model_version);

-- migrate:down

DROP INDEX IF EXISTS idx_analysis_runs_model;
DROP INDEX IF EXISTS idx_analysis_jobs_model;
SELECT 1;
