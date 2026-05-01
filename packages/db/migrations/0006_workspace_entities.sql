CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  active_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_workspaces_user_default
  ON workspaces(user_id, is_default)
  WHERE is_default = 1;

CREATE TABLE workspace_clocks (
  workspace_id TEXT PRIMARY KEY,
  next_version INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE workspace_entities (
  id TEXT PRIMARY KEY,
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
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_workspace_entities_key
  ON workspace_entities(workspace_id, entity_type, entity_id);

CREATE INDEX idx_workspace_entities_changes
  ON workspace_entities(workspace_id, version);

CREATE TABLE workspace_mutations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_mutation_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('draft', 'saved_table', 'saved_draft', 'folder')),
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_workspace_mutations_client
  ON workspace_mutations(workspace_id, client_mutation_id);
