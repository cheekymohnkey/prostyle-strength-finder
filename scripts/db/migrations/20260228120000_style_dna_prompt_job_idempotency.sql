-- migrate:up

ALTER TABLE style_dna_prompt_jobs
ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_style_dna_prompt_jobs_idempotency
  ON style_dna_prompt_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- migrate:down

DROP INDEX IF EXISTS idx_style_dna_prompt_jobs_idempotency;
