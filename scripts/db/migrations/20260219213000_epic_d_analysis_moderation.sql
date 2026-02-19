-- migrate:up

ALTER TABLE analysis_jobs ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE analysis_jobs ADD COLUMN rerun_of_job_id TEXT;

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_moderation_status
  ON analysis_jobs(moderation_status);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_rerun_of_job_id
  ON analysis_jobs(rerun_of_job_id, submitted_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_analysis_jobs_rerun_of_job_id;
DROP INDEX IF EXISTS idx_analysis_jobs_moderation_status;
