-- migrate:up

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'consumer',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (role IN ('admin', 'contributor', 'consumer')),
  CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE IF NOT EXISTS admin_actions_audit (
  admin_action_audit_id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_user_id) REFERENCES users(user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_audit_created_at
  ON admin_actions_audit(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_actions_audit_target
  ON admin_actions_audit(target_type, target_id, created_at DESC);

-- migrate:down

DROP INDEX IF EXISTS idx_admin_actions_audit_target;
DROP INDEX IF EXISTS idx_admin_actions_audit_created_at;
DROP TABLE IF EXISTS admin_actions_audit;
DROP TABLE IF EXISTS users;
