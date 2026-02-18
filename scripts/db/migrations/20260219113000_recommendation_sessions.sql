-- migrate:up

CREATE TABLE IF NOT EXISTS prompts (
  prompt_id TEXT PRIMARY KEY,
  prompt_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT NOT NULL DEFAULT 'v1',
  curated_flag INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recommendation_sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  extraction_id TEXT NOT NULL UNIQUE,
  prompt_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (prompt_id) REFERENCES prompts(prompt_id),
  FOREIGN KEY (extraction_id) REFERENCES recommendation_extractions(extraction_id)
);

CREATE TABLE IF NOT EXISTS recommendations (
  recommendation_id TEXT PRIMARY KEY,
  recommendation_session_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  combination_id TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence REAL NOT NULL,
  risk_notes_json TEXT NOT NULL,
  prompt_improvements_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (recommendation_session_id) REFERENCES recommendation_sessions(session_id)
);

CREATE INDEX IF NOT EXISTS idx_prompts_prompt_text
  ON prompts(prompt_text);

CREATE INDEX IF NOT EXISTS idx_recommendation_sessions_user_created_at
  ON recommendation_sessions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendations_session_rank
  ON recommendations(recommendation_session_id, rank ASC);

-- migrate:down

DROP INDEX IF EXISTS idx_recommendations_session_rank;
DROP INDEX IF EXISTS idx_recommendation_sessions_user_created_at;
DROP INDEX IF EXISTS idx_prompts_prompt_text;
DROP TABLE IF EXISTS recommendations;
DROP TABLE IF EXISTS recommendation_sessions;
DROP TABLE IF EXISTS prompts;
