-- 统一时间列表示：业务表全部改为 INTEGER（Unix 毫秒），与 auth 表及后续迁移一致
-- 转换路径：ADD INTEGER 列 → TEXT 毫秒换算回填 → DROP 旧列 → RENAME（SQLite 不支持原地改列类型）
-- 引用被删列的索引与触发器需先删后建

DROP TRIGGER IF EXISTS credit_ledger_update_balance;

ALTER TABLE credit_accounts
  ADD COLUMN updated_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE credit_accounts
  SET updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000;
ALTER TABLE credit_accounts DROP COLUMN updated_at;
ALTER TABLE credit_accounts RENAME COLUMN updated_at_ms TO updated_at;

ALTER TABLE usage_events
  ADD COLUMN created_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE usage_events
  SET created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000;
DROP INDEX IF EXISTS idx_usage_events_user_created_at;
DROP INDEX IF EXISTS idx_usage_events_status_created_at;
ALTER TABLE usage_events DROP COLUMN created_at;
ALTER TABLE usage_events RENAME COLUMN created_at_ms TO created_at;
CREATE INDEX idx_usage_events_user_created_at
  ON usage_events(user_id, created_at DESC);
CREATE INDEX idx_usage_events_status_created_at
  ON usage_events(status, created_at);

ALTER TABLE credit_ledger
  ADD COLUMN created_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE credit_ledger
  SET created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000;
DROP INDEX IF EXISTS idx_credit_ledger_user_created_at;
ALTER TABLE credit_ledger DROP COLUMN created_at;
ALTER TABLE credit_ledger RENAME COLUMN created_at_ms TO created_at;
CREATE INDEX idx_credit_ledger_user_created_at
  ON credit_ledger(user_id, created_at DESC);

ALTER TABLE workspace_snapshots
  ADD COLUMN created_at_ms INTEGER NOT NULL DEFAULT 0;
ALTER TABLE workspace_snapshots
  ADD COLUMN updated_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE workspace_snapshots
  SET
    created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000,
    updated_at_ms = CAST(strftime('%s', updated_at) AS INTEGER) * 1000;
ALTER TABLE workspace_snapshots DROP COLUMN created_at;
ALTER TABLE workspace_snapshots DROP COLUMN updated_at;
ALTER TABLE workspace_snapshots RENAME COLUMN created_at_ms TO created_at;
ALTER TABLE workspace_snapshots RENAME COLUMN updated_at_ms TO updated_at;

ALTER TABLE workspace_links
  ADD COLUMN migrated_at_ms INTEGER;
ALTER TABLE workspace_links
  ADD COLUMN created_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE workspace_links
  SET
    migrated_at_ms = CASE
      WHEN migrated_at IS NULL THEN NULL
      ELSE CAST(strftime('%s', migrated_at) AS INTEGER) * 1000
    END,
    created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000;
ALTER TABLE workspace_links DROP COLUMN migrated_at;
ALTER TABLE workspace_links DROP COLUMN created_at;
ALTER TABLE workspace_links RENAME COLUMN migrated_at_ms TO migrated_at;
ALTER TABLE workspace_links RENAME COLUMN created_at_ms TO created_at;

ALTER TABLE admin_user_flags
  ADD COLUMN disabled_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE admin_user_flags
  SET disabled_at_ms = CAST(strftime('%s', disabled_at) AS INTEGER) * 1000;
ALTER TABLE admin_user_flags DROP COLUMN disabled_at;
ALTER TABLE admin_user_flags RENAME COLUMN disabled_at_ms TO disabled_at;

ALTER TABLE ai_budget_reservations
  ADD COLUMN settled_at_ms INTEGER;
ALTER TABLE ai_budget_reservations
  ADD COLUMN created_at_ms INTEGER NOT NULL DEFAULT 0;
UPDATE ai_budget_reservations
  SET
    settled_at_ms = CASE
      WHEN settled_at IS NULL THEN NULL
      ELSE CAST(strftime('%s', settled_at) AS INTEGER) * 1000
    END,
    created_at_ms = CAST(strftime('%s', created_at) AS INTEGER) * 1000;
ALTER TABLE ai_budget_reservations DROP COLUMN settled_at;
ALTER TABLE ai_budget_reservations DROP COLUMN created_at;
ALTER TABLE ai_budget_reservations RENAME COLUMN settled_at_ms TO settled_at;
ALTER TABLE ai_budget_reservations RENAME COLUMN created_at_ms TO created_at;

CREATE TRIGGER credit_ledger_update_balance
AFTER INSERT ON credit_ledger
BEGIN
  UPDATE credit_accounts
  SET
    balance = NEW.balance_after,
    version = version + 1,
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE user_id = NEW.user_id;
END;
