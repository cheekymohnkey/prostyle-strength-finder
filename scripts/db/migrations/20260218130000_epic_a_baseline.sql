-- migrate:up

CREATE TABLE IF NOT EXISTS analysis_jobs (
  job_id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  run_type TEXT NOT NULL,
  image_id TEXT NOT NULL,
  status TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  analysis_run_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  started_at TEXT,
  completed_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  FOREIGN KEY (job_id) REFERENCES analysis_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_job_id ON analysis_runs(job_id);

-- migrate:down

DROP INDEX IF EXISTS idx_analysis_runs_job_id;
DROP INDEX IF EXISTS idx_analysis_jobs_status;
DROP TABLE IF EXISTS analysis_runs;
DROP TABLE IF EXISTS analysis_jobs;
