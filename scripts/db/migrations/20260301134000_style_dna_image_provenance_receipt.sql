-- migrate:up

ALTER TABLE style_dna_images
  ADD COLUMN provenance_source TEXT;

ALTER TABLE style_dna_images
  ADD COLUMN provenance_captured_at TEXT;

ALTER TABLE style_dna_images
  ADD COLUMN provenance_operator_assertion TEXT;

CREATE INDEX IF NOT EXISTS idx_style_dna_images_provenance_captured_at
  ON style_dna_images(provenance_captured_at);

-- migrate:down

DROP INDEX IF EXISTS idx_style_dna_images_provenance_captured_at;

-- SQLite does not support DROP COLUMN safely for existing tables in this migration workflow.
-- Column removal is intentionally omitted in down migration.
