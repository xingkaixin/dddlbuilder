INSERT OR IGNORE INTO user (
  id,
  name,
  email,
  email_verified,
  created_at,
  updated_at
) VALUES (
  'usr_local_seed',
  'Local Seed User',
  'local-seed@ddlbuilder.dev',
  1,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT OR IGNORE INTO account (
  id,
  account_id,
  provider_id,
  user_id,
  created_at,
  updated_at
) VALUES (
  'acct_local_seed_credential',
  'usr_local_seed',
  'credential',
  'usr_local_seed',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT OR IGNORE INTO credit_accounts (
  user_id,
  balance,
  version
) VALUES (
  'usr_local_seed',
  100000,
  1
);

INSERT OR IGNORE INTO credit_ledger (
  id,
  user_id,
  kind,
  source,
  amount,
  balance_after,
  idempotency_key,
  metadata_json
) VALUES (
  'ledger_local_seed_signup_bonus',
  'usr_local_seed',
  'grant',
  'signup_bonus',
  100000,
  100000,
  'seed-signup-bonus',
  '{"seed":true}'
);
