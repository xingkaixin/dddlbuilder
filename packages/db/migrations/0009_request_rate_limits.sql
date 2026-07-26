CREATE TABLE request_rate_limits (
  scope TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_id TEXT NOT NULL,
  value INTEGER NOT NULL CHECK (value >= 0),
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (scope, subject)
);

CREATE INDEX idx_request_rate_limits_expiry
  ON request_rate_limits(expires_at);
