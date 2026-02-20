-- migrate:up

CREATE TABLE IF NOT EXISTS approval_policies (
  policy_scope TEXT PRIMARY KEY,
  approval_mode TEXT NOT NULL DEFAULT 'auto-approve',
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (approval_mode IN ('auto-approve', 'manual'))
);

CREATE INDEX IF NOT EXISTS idx_approval_policies_mode
  ON approval_policies(approval_mode);

INSERT OR IGNORE INTO approval_policies (
  policy_scope, approval_mode, updated_by, created_at, updated_at
) VALUES (
  'global',
  'auto-approve',
  'system',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- migrate:down

DROP INDEX IF EXISTS idx_approval_policies_mode;
DROP TABLE IF EXISTS approval_policies;
