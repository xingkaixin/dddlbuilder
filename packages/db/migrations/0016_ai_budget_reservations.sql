CREATE TABLE ai_budget_reservations (
  usage_event_id TEXT PRIMARY KEY,
  window_id TEXT NOT NULL,
  reserved_tokens INTEGER NOT NULL CHECK (reserved_tokens > 0),
  actual_tokens INTEGER CHECK (actual_tokens >= 0),
  limit_tokens INTEGER NOT NULL CHECK (limit_tokens > 0),
  expires_at INTEGER NOT NULL,
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usage_event_id) REFERENCES usage_events(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_budget_reservations_expires_at
  ON ai_budget_reservations(expires_at);

CREATE TRIGGER ai_budget_reservation_check
BEFORE INSERT ON ai_budget_reservations
BEGIN
  SELECT CASE
    WHEN NEW.reserved_tokens > NEW.limit_tokens THEN RAISE(ABORT, 'BUDGET_EXCEEDED')
    WHEN COALESCE(
      (
        SELECT CASE
          WHEN window_id = NEW.window_id THEN value
          ELSE 0
        END
        FROM ai_governance_counters
        WHERE scope = 'daily-budget' AND subject = 'global'
      ),
      0
    ) + NEW.reserved_tokens > NEW.limit_tokens THEN RAISE(ABORT, 'BUDGET_EXCEEDED')
  END;
END;

CREATE TRIGGER ai_budget_reservation_count
AFTER INSERT ON ai_budget_reservations
BEGIN
  INSERT INTO ai_governance_counters (
    scope,
    subject,
    window_id,
    value,
    expires_at
  )
  VALUES (
    'daily-budget',
    'global',
    NEW.window_id,
    NEW.reserved_tokens,
    NEW.expires_at
  )
  ON CONFLICT(scope, subject) DO UPDATE SET
    window_id = excluded.window_id,
    value = CASE
      WHEN ai_governance_counters.window_id = excluded.window_id
        THEN ai_governance_counters.value + excluded.value
      ELSE excluded.value
    END,
    expires_at = excluded.expires_at;
END;

CREATE TRIGGER ai_budget_settlement_count
AFTER UPDATE OF actual_tokens ON ai_budget_reservations
WHEN OLD.actual_tokens IS NULL AND NEW.actual_tokens IS NOT NULL
BEGIN
  UPDATE ai_governance_counters
  SET value = MAX(0, value - NEW.reserved_tokens + NEW.actual_tokens)
  WHERE
    scope = 'daily-budget'
    AND subject = 'global'
    AND window_id = NEW.window_id;
END;
