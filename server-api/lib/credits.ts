import type { ApiEnv } from './context.js';

export type CreditLedgerKind = 'grant' | 'consume' | 'refund';

export type CreditLedgerSource =
  | 'signup_bonus'
  | 'ai_generate'
  | 'ai_review'
  | 'ai_explain'
  | 'manual_adjustment';

export type CreditAccountRow = {
  userId: string;
  balance: number;
  version: number;
  updatedAt: string;
};

export type CreditLedgerRow = {
  id: string;
  userId: string;
  kind: CreditLedgerKind;
  source: CreditLedgerSource;
  amount: number;
  balanceAfter: number;
  idempotencyKey: string;
  relatedUsageId: string | null;
  metadataJson: string | null;
  createdAt: string;
};

type CreditMutationInput = {
  userId: string;
  kind: CreditLedgerKind;
  source: CreditLedgerSource;
  amount: number;
  idempotencyKey: string;
  relatedUsageId?: string | null;
  metadata?: Record<string, unknown> | null;
  ledgerId?: string;
};

const MAX_RETRIES = 3;

const toLedgerRow = (row: Record<string, unknown>): CreditLedgerRow => ({
  id: String(row.id),
  userId: String(row.userId),
  kind: row.kind as CreditLedgerKind,
  source: row.source as CreditLedgerSource,
  amount: Number(row.amount),
  balanceAfter: Number(row.balanceAfter),
  idempotencyKey: String(row.idempotencyKey),
  relatedUsageId: typeof row.relatedUsageId === 'string' ? row.relatedUsageId : null,
  metadataJson: typeof row.metadataJson === 'string' ? row.metadataJson : null,
  createdAt: String(row.createdAt),
});

const readExistingLedger = async (
  env: ApiEnv['Bindings'],
  idempotencyKey: string,
): Promise<CreditLedgerRow | null> => {
  const existing = await env.USER_DB.prepare(
    `
      SELECT
        id,
        user_id AS userId,
        kind,
        source,
        amount,
        balance_after AS balanceAfter,
        idempotency_key AS idempotencyKey,
        related_usage_id AS relatedUsageId,
        metadata_json AS metadataJson,
        created_at AS createdAt
      FROM credit_ledger
      WHERE idempotency_key = ?
      LIMIT 1
    `,
  )
    .bind(idempotencyKey)
    .first<Record<string, unknown>>();

  return existing ? toLedgerRow(existing) : null;
};

export const ensureCreditAccount = async (env: ApiEnv['Bindings'], userId: string) => {
  await env.USER_DB.prepare(
    `
      INSERT OR IGNORE INTO credit_accounts (user_id, balance, version)
      VALUES (?, 0, 0)
    `,
  )
    .bind(userId)
    .run();
};

export const getCreditAccount = async (
  env: ApiEnv['Bindings'],
  userId: string,
): Promise<CreditAccountRow | null> => {
  await ensureCreditAccount(env, userId);
  const row = await env.USER_DB.prepare(
    `
      SELECT
        user_id AS userId,
        balance,
        version,
        updated_at AS updatedAt
      FROM credit_accounts
      WHERE user_id = ?
      LIMIT 1
    `,
  )
    .bind(userId)
    .first<CreditAccountRow>();

  return row ?? null;
};

export const listCreditLedger = async (
  env: ApiEnv['Bindings'],
  userId: string,
  limit: number,
): Promise<CreditLedgerRow[]> => {
  const result = await env.USER_DB.prepare(
    `
      SELECT
        id,
        user_id AS userId,
        kind,
        source,
        amount,
        balance_after AS balanceAfter,
        idempotency_key AS idempotencyKey,
        related_usage_id AS relatedUsageId,
        metadata_json AS metadataJson,
        created_at AS createdAt
      FROM credit_ledger
      WHERE user_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `,
  )
    .bind(userId, limit)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(toLedgerRow);
};

const computeNextBalance = (currentBalance: number, input: CreditMutationInput) => {
  if (input.kind === 'consume') {
    if (currentBalance < input.amount) {
      throw new Error('CREDIT_EXHAUSTED');
    }
    return currentBalance - input.amount;
  }

  return currentBalance + input.amount;
};

export const applyCreditMutation = async (
  env: ApiEnv['Bindings'],
  input: CreditMutationInput,
): Promise<CreditLedgerRow> => {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('INVALID_CREDIT_AMOUNT');
  }

  const existing = await readExistingLedger(env, input.idempotencyKey);
  if (existing) {
    return existing;
  }

  await ensureCreditAccount(env, input.userId);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const account = await getCreditAccount(env, input.userId);
    if (!account) {
      throw new Error('CREDIT_ACCOUNT_MISSING');
    }

    const nextBalance = computeNextBalance(account.balance, input);
    const updated = await env.USER_DB.prepare(
      `
        UPDATE credit_accounts
        SET balance = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND version = ?
      `,
    )
      .bind(nextBalance, input.userId, account.version)
      .run();

    if (!updated.success || Number(updated.meta.changes ?? 0) === 0) {
      continue;
    }

    const ledgerId = input.ledgerId ?? `${input.kind}:${input.idempotencyKey}`;
    await env.USER_DB.prepare(
      `
        INSERT INTO credit_ledger (
          id,
          user_id,
          kind,
          source,
          amount,
          balance_after,
          idempotency_key,
          related_usage_id,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
      .bind(
        ledgerId,
        input.userId,
        input.kind,
        input.source,
        input.amount,
        nextBalance,
        input.idempotencyKey,
        input.relatedUsageId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      )
      .run();

    const created = await readExistingLedger(env, input.idempotencyKey);
    if (!created) {
      throw new Error('CREDIT_LEDGER_WRITE_FAILED');
    }
    return created;
  }

  const retryExisting = await readExistingLedger(env, input.idempotencyKey);
  if (retryExisting) {
    return retryExisting;
  }

  throw new Error('CREDIT_CONFLICT');
};
