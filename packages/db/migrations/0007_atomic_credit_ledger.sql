DROP INDEX IF EXISTS idx_usage_events_request_id;
CREATE UNIQUE INDEX idx_usage_events_identity
  ON usage_events(user_id, route_key, request_id);

DROP INDEX IF EXISTS idx_credit_ledger_idempotency_key;
CREATE UNIQUE INDEX idx_credit_ledger_user_idempotency
  ON credit_ledger(user_id, idempotency_key);

CREATE TRIGGER credit_ledger_validate_balance
BEFORE INSERT ON credit_ledger
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM credit_accounts WHERE user_id = NEW.user_id
    ) THEN RAISE(ABORT, 'CREDIT_ACCOUNT_MISSING')
    WHEN NEW.kind = 'consume' AND (
      SELECT balance FROM credit_accounts WHERE user_id = NEW.user_id
    ) < NEW.amount THEN RAISE(ABORT, 'CREDIT_EXHAUSTED')
    WHEN NEW.balance_after != (
      SELECT CASE
        WHEN NEW.kind = 'consume' THEN balance - NEW.amount
        ELSE balance + NEW.amount
      END
      FROM credit_accounts
      WHERE user_id = NEW.user_id
    ) THEN RAISE(ABORT, 'CREDIT_CONFLICT')
  END;
END;

CREATE TRIGGER credit_ledger_update_balance
AFTER INSERT ON credit_ledger
BEGIN
  UPDATE credit_accounts
  SET
    balance = NEW.balance_after,
    version = version + 1,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = NEW.user_id;
END;
