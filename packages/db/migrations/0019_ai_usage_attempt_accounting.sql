ALTER TABLE usage_events ADD COLUMN charged_tokens INTEGER CHECK (
  charged_tokens IS NULL OR (
    typeof(charged_tokens) = 'integer'
    AND charged_tokens >= 0
    AND charged_tokens <= 9007199254740991
  )
);

ALTER TABLE usage_events ADD COLUMN attempt_count INTEGER CHECK (
  attempt_count IS NULL OR (
    typeof(attempt_count) = 'integer'
    AND attempt_count >= 0
    AND attempt_count <= 9007199254740991
  )
);

ALTER TABLE usage_events ADD COLUMN usage_is_estimated INTEGER CHECK (
  usage_is_estimated IS NULL OR usage_is_estimated IN (0, 1)
);

ALTER TABLE usage_events ADD COLUMN provider_budget_tokens INTEGER CHECK (
  provider_budget_tokens IS NULL OR (
    typeof(provider_budget_tokens) = 'integer'
    AND provider_budget_tokens >= 0
    AND provider_budget_tokens <= 9007199254740991
  )
);

ALTER TABLE usage_events ADD COLUMN recovery_after INTEGER CHECK (
  recovery_after IS NULL OR (
    typeof(recovery_after) = 'integer'
    AND recovery_after >= 0
    AND recovery_after <= 9007199254740991
  )
);

CREATE INDEX idx_usage_events_recovery
  ON usage_events(status, recovery_after, created_at);

CREATE INDEX idx_credit_ledger_related_usage
  ON credit_ledger(related_usage_id);

UPDATE usage_events
SET
  charged_tokens = CASE
    WHEN status IN ('succeeded', 'failed') THEN MAX(0, COALESCE((
        SELECT SUM(CASE
          WHEN kind = 'consume' THEN amount
          WHEN kind = 'refund' THEN -amount
          ELSE 0
        END)
        FROM credit_ledger
        WHERE related_usage_id = usage_events.id
      ), 0))
    WHEN status = 'pending' THEN 0
    WHEN status = 'settling_failed' THEN COALESCE(actual_total_tokens, 0)
    WHEN status = 'settling_succeeded' THEN COALESCE(actual_total_tokens, estimated_tokens)
    WHEN status = 'reclaiming' THEN COALESCE(actual_total_tokens, 0)
    ELSE NULL
  END,
  attempt_count = CASE
    WHEN status = 'pending' THEN 0
    ELSE NULL
  END,
  usage_is_estimated = CASE
    WHEN status = 'pending' THEN 0
    WHEN status IN (
      'succeeded', 'failed', 'reclaiming', 'settling_succeeded', 'settling_failed'
    ) THEN 1
    ELSE NULL
  END;

UPDATE usage_events
SET provider_budget_tokens = CASE
  WHEN status = 'pending' THEN 0
  WHEN status IN (
    'succeeded', 'failed', 'reclaiming', 'settling_succeeded', 'settling_failed'
  ) THEN COALESCE(
    (
      SELECT actual_tokens
      FROM ai_budget_reservations
      WHERE usage_event_id = usage_events.id AND actual_tokens IS NOT NULL
    ),
    MAX(charged_tokens, estimated_tokens, COALESCE(actual_total_tokens, 0))
  )
  ELSE NULL
END;

DROP TRIGGER IF EXISTS ai_budget_settlement_count;

CREATE TRIGGER ai_budget_settlement_count
AFTER UPDATE OF actual_tokens ON ai_budget_reservations
WHEN OLD.actual_tokens IS NULL AND NEW.actual_tokens IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.actual_tokens > 9007199254740991 THEN RAISE(ABORT, 'BUDGET_COUNTER_OVERFLOW')
    WHEN COALESCE((
      SELECT value
      FROM ai_governance_counters
      WHERE scope = 'daily-budget' AND subject = 'global' AND window_id = NEW.window_id
    ), 0) - NEW.reserved_tokens + NEW.actual_tokens > 9007199254740991
      THEN RAISE(ABORT, 'BUDGET_COUNTER_OVERFLOW')
  END;

  UPDATE ai_governance_counters
  SET value = MAX(0, value - NEW.reserved_tokens + NEW.actual_tokens)
  WHERE
    scope = 'daily-budget'
    AND subject = 'global'
    AND window_id = NEW.window_id;
END;

CREATE TRIGGER ai_usage_block_unsettled_debt
BEFORE INSERT ON usage_events
WHEN NEW.status = 'reserved' AND EXISTS (
  SELECT 1
  FROM usage_events
  WHERE user_id = NEW.user_id
    AND status IN ('settling_succeeded', 'settling_failed')
    AND charged_tokens > estimated_tokens
)
BEGIN
  SELECT RAISE(ABORT, 'AI_USAGE_DEBT_PENDING');
END;

CREATE TRIGGER ai_usage_retry_debt_after_credit
AFTER INSERT ON credit_ledger
WHEN NEW.kind IN ('grant', 'refund')
BEGIN
  UPDATE usage_events
  SET recovery_after = NULL
  WHERE user_id = NEW.user_id
    AND status IN ('settling_succeeded', 'settling_failed')
    AND charged_tokens > estimated_tokens;
END;
