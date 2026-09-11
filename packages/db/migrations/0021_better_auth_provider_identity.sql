CREATE UNIQUE INDEX idx_account_provider_account ON account(provider_id, account_id);

DROP INDEX idx_account_issuer_account;
