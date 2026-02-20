-- migrate:up

CREATE TABLE IF NOT EXISTS contributor_submissions (
  submission_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  style_influence_id TEXT NOT NULL UNIQUE,
  source_image_id TEXT NOT NULL,
  status TEXT NOT NULL,
  last_job_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
  FOREIGN KEY (style_influence_id) REFERENCES style_influences(style_influence_id),
  FOREIGN KEY (last_job_id) REFERENCES analysis_jobs(job_id),
  CHECK (status IN ('created', 'queued', 'in_progress', 'retrying', 'succeeded', 'failed', 'dead_letter', 'pending_approval'))
);

CREATE TABLE IF NOT EXISTS contributor_submission_actions (
  contributor_submission_action_id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  job_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES contributor_submissions(submission_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (job_id) REFERENCES analysis_jobs(job_id)
);

CREATE INDEX IF NOT EXISTS idx_contributor_submissions_owner_updated
  ON contributor_submissions(owner_user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_contributor_submissions_last_job
  ON contributor_submissions(last_job_id);

CREATE INDEX IF NOT EXISTS idx_contributor_submission_actions_submission_created
  ON contributor_submission_actions(submission_id, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_contributor_submission_actions_submission_created;
DROP INDEX IF EXISTS idx_contributor_submissions_last_job;
DROP INDEX IF EXISTS idx_contributor_submissions_owner_updated;
DROP TABLE IF EXISTS contributor_submission_actions;
DROP TABLE IF EXISTS contributor_submissions;
