CREATE INDEX idx_workspaces_user_id
  ON workspaces(user_id);

CREATE INDEX idx_user_created_at
  ON user(created_at);
