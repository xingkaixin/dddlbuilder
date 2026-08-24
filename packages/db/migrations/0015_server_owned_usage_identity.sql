DROP INDEX IF EXISTS idx_usage_events_identity;

CREATE INDEX idx_usage_events_request_id
  ON usage_events(request_id);
