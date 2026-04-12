PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS workspace_links;
DROP TABLE IF EXISTS workspace_snapshots;
DROP TABLE IF EXISTS credit_ledger;
DROP TABLE IF EXISTS usage_events;
DROP TABLE IF EXISTS credit_accounts;
DROP TABLE IF EXISTS user_identities;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS account;
DROP TABLE IF EXISTS verification;
DROP TABLE IF EXISTS user;

CREATE TABLE user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX idx_user_email ON user(email);

CREATE TABLE session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_session_token ON session(token);
CREATE INDEX idx_session_user_id ON session(user_id);

CREATE TABLE account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX idx_account_user_id ON account(user_id);
CREATE UNIQUE INDEX idx_account_provider_account ON account(provider_id, account_id);

CREATE TABLE verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_verification_identifier ON verification(identifier);

CREATE TABLE credit_accounts (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE TABLE usage_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  route_key TEXT NOT NULL,
  request_id TEXT NOT NULL,
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  actual_total_tokens INTEGER,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_usage_events_request_id ON usage_events(request_id);
CREATE INDEX idx_usage_events_user_created_at ON usage_events(user_id, created_at DESC);

CREATE TABLE credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('grant', 'consume', 'refund')),
  source TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  idempotency_key TEXT NOT NULL,
  related_usage_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE,
  FOREIGN KEY (related_usage_id) REFERENCES usage_events(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX idx_credit_ledger_idempotency_key
  ON credit_ledger(idempotency_key);
CREATE INDEX idx_credit_ledger_user_created_at
  ON credit_ledger(user_id, created_at DESC);

CREATE TABLE workspace_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('global_draft', 'saved_table', 'saved_draft')),
  normalized_name TEXT,
  payload_json TEXT NOT NULL,
  source_updated_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE INDEX idx_workspace_snapshots_user_kind_name
  ON workspace_snapshots(user_id, kind, normalized_name);

CREATE TABLE workspace_links (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_fingerprint TEXT NOT NULL,
  migration_status TEXT NOT NULL CHECK (migration_status IN ('pending', 'completed', 'failed')),
  last_idempotency_key TEXT,
  migrated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_workspace_links_user_fingerprint
  ON workspace_links(user_id, local_fingerprint);

PRAGMA foreign_keys = ON;
