ALTER TABLE account ADD COLUMN issuer TEXT NOT NULL DEFAULT '';

UPDATE account SET issuer = 'local:' || provider_id WHERE issuer = '';

DROP INDEX IF EXISTS idx_account_provider_account;

CREATE UNIQUE INDEX idx_account_issuer_account ON account(issuer, account_id);
