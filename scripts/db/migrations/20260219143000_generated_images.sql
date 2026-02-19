-- migrate:up

CREATE TABLE IF NOT EXISTS generated_images (
  generated_image_id TEXT PRIMARY KEY,
  recommendation_session_id TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'generated',
  storage_key TEXT NOT NULL,
  storage_uri TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (recommendation_session_id) REFERENCES recommendation_sessions(session_id),
  CHECK (source_type IN ('generated')),
  CHECK (size_bytes > 0)
);

CREATE INDEX IF NOT EXISTS idx_generated_images_session_created
  ON generated_images(recommendation_session_id, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_generated_images_session_created;
DROP TABLE IF EXISTS generated_images;
