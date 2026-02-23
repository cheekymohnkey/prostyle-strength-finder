-- migrate:up

CREATE TABLE IF NOT EXISTS baseline_prompt_suite_item_metadata (
  metadata_id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  prompt_key TEXT NOT NULL,
  domain TEXT NOT NULL,
  what_it_tests TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (suite_id) REFERENCES baseline_prompt_suites(suite_id),
  FOREIGN KEY (suite_id, prompt_key) REFERENCES baseline_prompt_suite_items(suite_id, prompt_key),
  UNIQUE (suite_id, prompt_key)
);

CREATE INDEX IF NOT EXISTS idx_baseline_prompt_item_metadata_suite
  ON baseline_prompt_suite_item_metadata(suite_id, prompt_key);

-- migrate:down

DROP INDEX IF EXISTS idx_baseline_prompt_item_metadata_suite;
DROP TABLE IF EXISTS baseline_prompt_suite_item_metadata;
