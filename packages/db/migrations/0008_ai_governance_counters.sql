CREATE TABLE ai_governance_counters (
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, subject)
);

CREATE INDEX idx_ai_governance_counters_expires_at
  ON ai_governance_counters(expires_at);
