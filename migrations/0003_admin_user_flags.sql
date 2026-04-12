CREATE TABLE IF NOT EXISTS admin_user_flags (
  user_id TEXT PRIMARY KEY,
  disabled_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  disabled_reason TEXT,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);
