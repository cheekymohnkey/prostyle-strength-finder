-- migrate:up

CREATE TABLE IF NOT EXISTS queue_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL UNIQUE,
  queue_url TEXT NOT NULL,
  body TEXT NOT NULL,
  receipt_handle TEXT,
  status TEXT NOT NULL,
  receive_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_messages_queue_status_available
  ON queue_messages(queue_url, status, available_at);

-- migrate:down

DROP INDEX IF EXISTS idx_queue_messages_queue_status_available;
DROP TABLE IF EXISTS queue_messages;
