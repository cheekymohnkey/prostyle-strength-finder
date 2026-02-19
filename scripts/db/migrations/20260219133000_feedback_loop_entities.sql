-- migrate:up

CREATE TABLE IF NOT EXISTS post_result_feedback (
  feedback_id TEXT PRIMARY KEY,
  recommendation_session_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  generated_image_id TEXT,
  emoji_rating TEXT,
  useful_flag INTEGER,
  comments TEXT,
  evidence_strength TEXT NOT NULL DEFAULT 'minor',
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (recommendation_session_id) REFERENCES recommendation_sessions(session_id),
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(recommendation_id),
  CHECK (emoji_rating IS NULL OR emoji_rating IN ('🙂', '☹️')),
  CHECK (useful_flag IS NULL OR useful_flag IN (0, 1)),
  CHECK (evidence_strength IN ('minor', 'normal'))
);

CREATE TABLE IF NOT EXISTS alignment_evaluations (
  alignment_evaluation_id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL UNIQUE,
  alignment_score REAL NOT NULL,
  mismatch_summary TEXT NOT NULL,
  suggested_prompt_adjustments_json TEXT NOT NULL,
  alternative_combination_ids_json TEXT NOT NULL,
  confidence_delta REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (feedback_id) REFERENCES post_result_feedback(feedback_id),
  CHECK (alignment_score >= 0 AND alignment_score <= 1),
  CHECK (confidence_delta >= -0.25 AND confidence_delta <= 0.25)
);

CREATE INDEX IF NOT EXISTS idx_post_result_feedback_session_created
  ON post_result_feedback(recommendation_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_post_result_feedback_recommendation_created
  ON post_result_feedback(recommendation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alignment_evaluations_feedback
  ON alignment_evaluations(feedback_id);

-- migrate:down

DROP INDEX IF EXISTS idx_alignment_evaluations_feedback;
DROP INDEX IF EXISTS idx_post_result_feedback_recommendation_created;
DROP INDEX IF EXISTS idx_post_result_feedback_session_created;
DROP TABLE IF EXISTS alignment_evaluations;
DROP TABLE IF EXISTS post_result_feedback;
