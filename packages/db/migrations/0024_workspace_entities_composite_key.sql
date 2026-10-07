-- 以 (workspace_id, entity_type, entity_id) 为主键，去掉拼接的 id 列及其重复唯一索引
-- 不再重建 idx_workspace_entities_changes：已无按 version 游标拉取的查询，每次 upsert 改 version 都要额外写它
PRAGMA foreign_keys = OFF;

CREATE TABLE workspace_entities_new (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('draft', 'saved_table', 'saved_draft', 'folder')),
  entity_id TEXT NOT NULL,
  payload_json TEXT,
  content_hash TEXT,
  version INTEGER NOT NULL,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, entity_type, entity_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

INSERT INTO workspace_entities_new (
  workspace_id,
  user_id,
  entity_type,
  entity_id,
  payload_json,
  content_hash,
  version,
  deleted_at,
  created_at,
  updated_at
)
SELECT
  workspace_id,
  user_id,
  entity_type,
  entity_id,
  payload_json,
  content_hash,
  version,
  deleted_at,
  created_at,
  updated_at
FROM workspace_entities;

DROP TABLE workspace_entities;

ALTER TABLE workspace_entities_new RENAME TO workspace_entities;

PRAGMA foreign_keys = ON;
