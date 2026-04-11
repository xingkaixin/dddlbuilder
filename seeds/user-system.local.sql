INSERT OR IGNORE INTO users (
  id,
  status,
  primary_email
) VALUES (
  'usr_local_seed',
  'active',
  'local-seed@ddlbuilder.dev'
);

INSERT OR IGNORE INTO user_identities (
  id,
  user_id,
  provider,
  provider_user_id,
  provider_email
) VALUES (
  'ident_local_seed',
  'usr_local_seed',
  'supabase',
  'supabase-local-seed',
  'local-seed@ddlbuilder.dev'
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
