-- 只有确认完成的迁移才写入 workspace_links，行存在即表示已完成；未完成状态和幂等键都无读取方
DELETE FROM workspace_links WHERE migration_status <> 'completed';

ALTER TABLE workspace_links DROP COLUMN migration_status;

ALTER TABLE workspace_links DROP COLUMN last_idempotency_key;
