PRAGMA foreign_keys = OFF;

CREATE TABLE workspace_snapshots_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('global_draft', 'draft', 'saved_table', 'saved_draft', 'folder')),
  normalized_name TEXT,
  payload_json TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

INSERT INTO workspace_snapshots_new SELECT * FROM workspace_snapshots;

DROP TABLE workspace_snapshots;

ALTER TABLE workspace_snapshots_new RENAME TO workspace_snapshots;

CREATE INDEX idx_workspace_snapshots_user_kind_name
  ON workspace_snapshots(user_id, kind, normalized_name);

PRAGMA foreign_keys = ON;
