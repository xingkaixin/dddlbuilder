DROP TRIGGER IF EXISTS credit_ledger_validate_balance;

CREATE TRIGGER credit_ledger_validate_balance
BEFORE INSERT ON credit_ledger
BEGIN
  SELECT CASE
    WHEN typeof(NEW.amount) != 'integer'
      OR NEW.amount <= 0
      OR NEW.amount > 9007199254740991
      THEN RAISE(ABORT, 'INVALID_CREDIT_AMOUNT')
    WHEN typeof(NEW.balance_after) != 'integer'
      OR NEW.balance_after > 9007199254740991
      THEN RAISE(ABORT, 'CREDIT_BALANCE_OVERFLOW')
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
