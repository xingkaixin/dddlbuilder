CREATE TABLE ai_daily_budget_counters (
  window_id TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK (
    typeof(value) = 'integer' AND value >= 0 AND value <= 9007199254740991
  ),
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_ai_budget_reservations_window_id
  ON ai_budget_reservations(window_id);

INSERT INTO ai_daily_budget_counters (window_id, value, expires_at)
SELECT window_id, value, expires_at
FROM ai_governance_counters
WHERE scope = 'daily-budget' AND subject = 'global';

-- Recover overwritten windows without double-counting existing totals or losing older usage.
INSERT INTO ai_daily_budget_counters (window_id, value, expires_at)
SELECT window_id, SUM(COALESCE(actual_tokens, reserved_tokens)), MAX(expires_at)
FROM ai_budget_reservations
GROUP BY window_id
ON CONFLICT(window_id) DO UPDATE SET
  value = MAX(ai_daily_budget_counters.value, excluded.value),
  expires_at = MAX(ai_daily_budget_counters.expires_at, excluded.expires_at);

DELETE FROM ai_governance_counters
WHERE scope = 'daily-budget' AND subject = 'global';

DROP TRIGGER ai_budget_reservation_check;
DROP TRIGGER ai_budget_reservation_count;
DROP TRIGGER ai_budget_settlement_count;

CREATE TRIGGER ai_budget_reservation_check
BEFORE INSERT ON ai_budget_reservations
BEGIN
  SELECT CASE
    WHEN NEW.reserved_tokens > NEW.limit_tokens THEN RAISE(ABORT, 'BUDGET_EXCEEDED')
    WHEN COALESCE((
      SELECT value FROM ai_daily_budget_counters WHERE window_id = NEW.window_id
    ), 0) + NEW.reserved_tokens > NEW.limit_tokens THEN RAISE(ABORT, 'BUDGET_EXCEEDED')
  END;
END;

CREATE TRIGGER ai_budget_reservation_count
AFTER INSERT ON ai_budget_reservations
BEGIN
  INSERT INTO ai_daily_budget_counters (window_id, value, expires_at)
  VALUES (NEW.window_id, NEW.reserved_tokens, NEW.expires_at)
  ON CONFLICT(window_id) DO UPDATE SET
    value = ai_daily_budget_counters.value + excluded.value,
    expires_at = MAX(ai_daily_budget_counters.expires_at, excluded.expires_at);
END;

CREATE TRIGGER ai_budget_settlement_count
AFTER UPDATE OF actual_tokens ON ai_budget_reservations
WHEN OLD.actual_tokens IS NULL AND NEW.actual_tokens IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.actual_tokens > 9007199254740991 THEN RAISE(ABORT, 'BUDGET_COUNTER_OVERFLOW')
    WHEN COALESCE((
      SELECT value FROM ai_daily_budget_counters WHERE window_id = NEW.window_id
    ), 0) - NEW.reserved_tokens + NEW.actual_tokens > 9007199254740991
      THEN RAISE(ABORT, 'BUDGET_COUNTER_OVERFLOW')
  END;

  UPDATE ai_daily_budget_counters
  SET value = MAX(0, value - NEW.reserved_tokens + NEW.actual_tokens)
  WHERE window_id = NEW.window_id;
END;
