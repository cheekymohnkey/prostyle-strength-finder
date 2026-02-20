-- migrate:up

CREATE INDEX IF NOT EXISTS idx_prompts_status_created_at
  ON prompts(status, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_prompts_status_created_at;
