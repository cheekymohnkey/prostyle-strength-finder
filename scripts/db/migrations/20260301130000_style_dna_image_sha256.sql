-- migrate:up

ALTER TABLE style_dna_images
  ADD COLUMN content_sha256 TEXT;

CREATE INDEX IF NOT EXISTS idx_style_dna_images_content_sha256
  ON style_dna_images(content_sha256);

-- migrate:down

DROP INDEX IF EXISTS idx_style_dna_images_content_sha256;

-- SQLite does not support DROP COLUMN safely for existing tables in this migration workflow.
-- Column removal is intentionally omitted in down migration.
