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

export type CreditLedgerListOptions = {
  limit: number;
  offset: number;
  startDate?: string;
  endDate?: string;
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

export const readCreditLedgerEntry = async (
  env: ApiEnv['Bindings'],
  userId: string,
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
      WHERE user_id = ? AND idempotency_key = ?
      LIMIT 1
    `,
  )
    .bind(userId, idempotencyKey)
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
  options: CreditLedgerListOptions,
): Promise<CreditLedgerRow[]> => {
  const where = ['user_id = ?'];
  const values: unknown[] = [userId];

  if (options.startDate) {
    where.push('created_at >= ?');
    values.push(options.startDate);
  }

  if (options.endDate) {
    where.push('created_at < ?');
    values.push(options.endDate);
  }

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
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
  )
    .bind(...values, options.limit, options.offset)
    .all<Record<string, unknown>>();

  return (result.results ?? []).map(toLedgerRow);
};

export const countCreditLedger = async (
  env: ApiEnv['Bindings'],
  userId: string,
  options: Pick<CreditLedgerListOptions, 'startDate' | 'endDate'> = {},
): Promise<number> => {
  const where = ['user_id = ?'];
  const values: unknown[] = [userId];

  if (options.startDate) {
    where.push('created_at >= ?');
    values.push(options.startDate);
  }

  if (options.endDate) {
    where.push('created_at < ?');
    values.push(options.endDate);
  }

  const row = await env.USER_DB.prepare(
    `
      SELECT COUNT(*) AS total
      FROM credit_ledger
      WHERE ${where.join(' AND ')}
    `,
  )
    .bind(...values)
    .first<{ total: number }>();

  return Number(row?.total ?? 0);
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

const validateExistingLedger = (existing: CreditLedgerRow, input: CreditMutationInput) => {
  if (
    existing.userId !== input.userId ||
    existing.kind !== input.kind ||
    existing.source !== input.source ||
    existing.amount !== input.amount ||
    existing.relatedUsageId !== (input.relatedUsageId ?? null)
  ) {
    throw new Error('CREDIT_IDEMPOTENCY_CONFLICT');
  }
  return existing;
};

const isRetryableCreditConflict = (error: unknown) =>
  error instanceof Error && error.message.includes('CREDIT_CONFLICT');

export const applyCreditMutation = async (
  env: ApiEnv['Bindings'],
  input: CreditMutationInput,
): Promise<CreditLedgerRow> => {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('INVALID_CREDIT_AMOUNT');
  }

  const existing = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
  if (existing) {
    return validateExistingLedger(existing, input);
  }

  await ensureCreditAccount(env, input.userId);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    const account = await getCreditAccount(env, input.userId);
    if (!account) {
      throw new Error('CREDIT_ACCOUNT_MISSING');
    }

    const nextBalance = computeNextBalance(account.balance, input);
    const ledgerId = input.ledgerId ?? `${input.kind}:${input.idempotencyKey}`;
    try {
      const inserted = await env.USER_DB.prepare(
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
      if (!inserted.success || Number(inserted.meta.changes ?? 0) === 0) {
        const concurrent = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
        if (concurrent) {
          return validateExistingLedger(concurrent, input);
        }
        continue;
      }
    } catch (error) {
      const concurrent = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
      if (concurrent) {
        return validateExistingLedger(concurrent, input);
      }
      if (isRetryableCreditConflict(error)) {
        continue;
      }
      throw error;
    }

    const created = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
    if (!created) {
      throw new Error('CREDIT_LEDGER_WRITE_FAILED');
    }
    return validateExistingLedger(created, input);
  }

  const retryExisting = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
  if (retryExisting) {
    return validateExistingLedger(retryExisting, input);
  }

  throw new Error('CREDIT_CONFLICT');
};
