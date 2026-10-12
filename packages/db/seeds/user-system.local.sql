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
  issuer,
  provider_id,
  user_id,
  created_at,
  updated_at
) VALUES (
  'acct_local_seed_credential',
  'usr_local_seed',
  'local:credential',
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
  0,
  1
);

-- 余额校验触发器先于唯一约束执行，OR IGNORE 拦不住重复执行时的 CREDIT_CONFLICT
INSERT INTO credit_ledger (
  id,
  user_id,
  kind,
  source,
  amount,
  balance_after,
  idempotency_key,
  metadata_json
)
SELECT
  'ledger_local_seed_signup_bonus',
  user_id,
  'grant',
  'signup_bonus',
  100000,
  balance + 100000,
  'seed-signup-bonus',
  '{"seed":true}'
FROM credit_accounts
WHERE user_id = 'usr_local_seed'
  AND NOT EXISTS (
    SELECT 1
    FROM credit_ledger
    WHERE user_id = 'usr_local_seed'
      AND idempotency_key = 'seed-signup-bonus'
  );
