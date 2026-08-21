-- 回收器按状态 + 时间扫描非终态的额度预留，现有索引以 user_id 开头帮不上忙
CREATE INDEX IF NOT EXISTS idx_usage_events_status_created_at
  ON usage_events(status, created_at);
