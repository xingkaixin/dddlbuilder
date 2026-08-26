import type { ApiEnv } from './context.js';
import { DomainError } from './http.js';

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

const validateExistingLedger = (existing: CreditLedgerRow, input: CreditMutationInput) => {
  if (
    existing.userId !== input.userId ||
    existing.kind !== input.kind ||
    existing.source !== input.source ||
    existing.amount !== input.amount ||
    existing.relatedUsageId !== (input.relatedUsageId ?? null)
  ) {
    throw new DomainError(409, 'SERVICE_UNAVAILABLE', 'CREDIT_IDEMPOTENCY_CONFLICT');
  }
  return existing;
};

const LEDGER_ABORT_CODES = [
  'CREDIT_ACCOUNT_MISSING',
  'CREDIT_EXHAUSTED',
  'INVALID_CREDIT_AMOUNT',
  'CREDIT_BALANCE_OVERFLOW',
] as const;

// 余额不变量由触发器执法（ADR-0001）；TS 只负责把 ABORT 消息还原成领域错误。
const mapLedgerAbort = (error: unknown): Error => {
  const message = error instanceof Error ? error.message : String(error);
  const abortCode = LEDGER_ABORT_CODES.find((code) => message.includes(code));
  if (abortCode === 'CREDIT_EXHAUSTED') {
    return new DomainError(402, 'CREDIT_EXHAUSTED', 'CREDIT_EXHAUSTED');
  }
  if (abortCode === 'CREDIT_ACCOUNT_MISSING') {
    return new DomainError(503, 'SERVICE_UNAVAILABLE', 'CREDIT_ACCOUNT_MISSING');
  }
  if (abortCode === 'INVALID_CREDIT_AMOUNT') {
    return new DomainError(500, 'SERVICE_UNAVAILABLE', 'INVALID_CREDIT_AMOUNT');
  }
  if (abortCode === 'CREDIT_BALANCE_OVERFLOW') {
    return new DomainError(409, 'SERVICE_UNAVAILABLE', 'CREDIT_BALANCE_OVERFLOW');
  }
  return new Error(message);
};

export const applyCreditMutation = async (
  env: ApiEnv['Bindings'],
  input: CreditMutationInput,
): Promise<CreditLedgerRow> => {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new DomainError(500, 'SERVICE_UNAVAILABLE', 'INVALID_CREDIT_AMOUNT');
  }

  const existing = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
  if (existing) {
    return validateExistingLedger(existing, input);
  }

  await ensureCreditAccount(env, input.userId);

  const ledgerId = input.ledgerId ?? `${input.kind}:${input.idempotencyKey}`;
  try {
    // 余额读取与插入必须在同一条语句里：语句内快照一致，触发器的余额校验不会因并发读到过期值而误报
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
        SELECT
          ?, ?, ?, ?, ?,
          CASE WHEN ? = 'consume' THEN balance - ? ELSE balance + ? END,
          ?, ?, ?
        FROM credit_accounts
        WHERE user_id = ?
      `,
    )
      .bind(
        ledgerId,
        input.userId,
        input.kind,
        input.source,
        input.amount,
        input.kind,
        input.amount,
        input.amount,
        input.idempotencyKey,
        input.relatedUsageId ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        input.userId,
      )
      .run();

    if (!inserted.success || Number(inserted.meta.changes ?? 0) === 0) {
      throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'CREDIT_ACCOUNT_MISSING');
    }
  } catch (error) {
    const concurrent = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
    if (concurrent) {
      return validateExistingLedger(concurrent, input);
    }
    throw mapLedgerAbort(error);
  }

  const created = await readCreditLedgerEntry(env, input.userId, input.idempotencyKey);
  if (!created) {
    throw new DomainError(503, 'SERVICE_UNAVAILABLE', 'CREDIT_LEDGER_WRITE_FAILED');
  }
  return created;
};
