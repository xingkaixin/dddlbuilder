CREATE INDEX IF NOT EXISTS idx_ai_conversations_active_expiry
  ON ai_conversations(expires_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_conversations_deleted_at
  ON ai_conversations(deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_operations_conversation_active
  ON ai_operations(conversation_id)
  WHERE submitted_at IS NOT NULL AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ai_daily_budget_counters_expires_at
  ON ai_daily_budget_counters(expires_at);
