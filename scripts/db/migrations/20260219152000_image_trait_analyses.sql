-- migrate:up

CREATE TABLE IF NOT EXISTS image_trait_analyses (
  image_trait_analysis_id TEXT PRIMARY KEY,
  analysis_run_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  trait_schema_version TEXT NOT NULL,
  trait_vector_json TEXT NOT NULL,
  evidence_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (analysis_run_id) REFERENCES analysis_runs(analysis_run_id),
  FOREIGN KEY (job_id) REFERENCES analysis_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_image_trait_analyses_job
  ON image_trait_analyses(job_id);

CREATE INDEX IF NOT EXISTS idx_image_trait_analyses_image
  ON image_trait_analyses(image_id, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_image_trait_analyses_image;
DROP INDEX IF EXISTS idx_image_trait_analyses_job;
DROP TABLE IF EXISTS image_trait_analyses;
