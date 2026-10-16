CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  route_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX ai_conversations_user ON ai_conversations(user_id, expires_at);
CREATE TABLE ai_operations (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  input_hash TEXT,
  submitted_at INTEGER,
  deadline_at INTEGER,
  stopped_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_operations_recovery ON ai_operations(completed_at, submitted_at);
CREATE TABLE ai_call_attempts (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES ai_operations(id) ON DELETE CASCADE,
  usage_id TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  estimated_input_tokens INTEGER NOT NULL,
  dispatched_at INTEGER,
  observed_tokens INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  usage_complete INTEGER NOT NULL DEFAULT 0,
  succeeded INTEGER NOT NULL DEFAULT 0,
  output_chars INTEGER NOT NULL DEFAULT 0,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_attempts_operation ON ai_call_attempts(operation_id);
