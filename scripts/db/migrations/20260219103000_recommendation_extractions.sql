-- migrate:up

CREATE TABLE IF NOT EXISTS recommendation_extractions (
  extraction_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  author TEXT,
  creation_time TEXT,
  source_job_id TEXT,
  model_family TEXT NOT NULL,
  model_version TEXT NOT NULL,
  model_selection_source TEXT NOT NULL,
  is_baseline INTEGER NOT NULL,
  has_profile INTEGER NOT NULL,
  has_sref INTEGER NOT NULL,
  parser_version TEXT NOT NULL,
  metadata_raw_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_recommendation_extractions_status
  ON recommendation_extractions(status);

-- migrate:down

DROP INDEX IF EXISTS idx_recommendation_extractions_status;
DROP TABLE IF EXISTS recommendation_extractions;
