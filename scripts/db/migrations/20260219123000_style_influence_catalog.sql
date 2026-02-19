-- migrate:up

CREATE TABLE IF NOT EXISTS style_influence_types (
  style_influence_type_id TEXT PRIMARY KEY,
  type_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  parameter_prefix TEXT NOT NULL,
  related_parameter_name TEXT,
  description TEXT,
  enabled_flag INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS style_influences (
  style_influence_id TEXT PRIMARY KEY,
  style_influence_type_id TEXT NOT NULL,
  influence_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  pinned_flag INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (style_influence_type_id) REFERENCES style_influence_types(style_influence_type_id)
);

CREATE TABLE IF NOT EXISTS style_influence_combinations (
  combination_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active_flag INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS style_influence_combination_items (
  combination_id TEXT NOT NULL,
  style_influence_id TEXT NOT NULL,
  PRIMARY KEY (combination_id, style_influence_id),
  FOREIGN KEY (combination_id) REFERENCES style_influence_combinations(combination_id),
  FOREIGN KEY (style_influence_id) REFERENCES style_influences(style_influence_id)
);

CREATE INDEX IF NOT EXISTS idx_style_influences_status
  ON style_influences(status);

CREATE INDEX IF NOT EXISTS idx_style_influences_type_status
  ON style_influences(style_influence_type_id, status);

CREATE INDEX IF NOT EXISTS idx_style_influence_combinations_active
  ON style_influence_combinations(active_flag);

CREATE INDEX IF NOT EXISTS idx_style_influence_items_combination
  ON style_influence_combination_items(combination_id);

-- migrate:down

DROP INDEX IF EXISTS idx_style_influence_items_combination;
DROP INDEX IF EXISTS idx_style_influence_combinations_active;
DROP INDEX IF EXISTS idx_style_influences_type_status;
DROP INDEX IF EXISTS idx_style_influences_status;
DROP TABLE IF EXISTS style_influence_combination_items;
DROP TABLE IF EXISTS style_influence_combinations;
DROP TABLE IF EXISTS style_influences;
DROP TABLE IF EXISTS style_influence_types;
