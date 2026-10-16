PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS board_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  snapshot_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL CHECK (
    operation IN ('done', 'reopen', 'note', 'assign', 'snooze', 'reorder', 'delete',
                  'useful', 'not_useful', 'nudge', 'prep', 'urgent')
  ),
  item_id INTEGER NOT NULL CHECK (item_id > 0),
  note TEXT,
  value TEXT,
  actor_email TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'applied', 'failed')),
  created_at TEXT NOT NULL,
  acked_at TEXT,
  ack_detail TEXT,
  received_at TEXT,
  lease_token TEXT,
  lease_expires_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  error_code TEXT,
  CHECK (
    (operation = 'note' AND length(trim(note)) BETWEEN 1 AND 2000)
    OR
    (operation <> 'note' AND note IS NULL)
  ),
  CHECK (
    (operation IN ('assign', 'snooze', 'reorder', 'nudge', 'prep', 'urgent') AND value IS NOT NULL AND length(value) <= 240)
    OR
    (operation IN ('done', 'reopen', 'note', 'delete', 'useful', 'not_useful') AND value IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS command_queue_pending_idx
  ON command_queue (state, id);

CREATE INDEX IF NOT EXISTS command_queue_lease_idx
  ON command_queue (state, lease_expires_at);

CREATE TABLE IF NOT EXISTS todo_catalogue (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  catalogue_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_operations (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  item_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (
    operation IN ('toggle', 'assign', 'add', 'edit', 'attach', 'detach', 'snooze', 'archive', 'delete')
  ),
  payload_json TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  client_ts TEXT NOT NULL,
  server_ts TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS todo_operations_item_idx
  ON todo_operations (item_id, sequence);

CREATE TABLE IF NOT EXISTS worklist_snapshot (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  worklist_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS board_threads (
  item_id INTEGER PRIMARY KEY CHECK (item_id > 0),
  thread_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('board', 'todo')),
  operation TEXT NOT NULL,
  item_id TEXT NOT NULL,
  value TEXT,
  title TEXT,
  ip TEXT,
  country TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS activity_log_at_idx ON activity_log (at);
CREATE INDEX IF NOT EXISTS activity_log_actor_idx ON activity_log (actor_email, at);

CREATE TABLE IF NOT EXISTS team_users (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  past_emails TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS team_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  user_key TEXT NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);
