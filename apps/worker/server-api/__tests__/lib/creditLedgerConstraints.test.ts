import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { createSqliteD1Database } from '../helpers/sqliteD1.js';

describe('credit ledger constraints', () => {
  let sqlite: DatabaseSync;

  beforeEach(() => {
    ({ sqlite } = createSqliteD1Database());
    sqlite
      .prepare(
        `
          INSERT INTO user (id, name, email, email_verified, created_at, updated_at)
          VALUES (?, ?, ?, 1, 1, 1)
        `,
      )
      .run('user-1', 'User', 'user@example.com');
    sqlite
      .prepare('INSERT INTO credit_accounts (user_id, balance, version) VALUES (?, 0, 0)')
      .run('user-1');
  });

  afterEach(() => sqlite.close());

  const insertLedger = (amount: number, balanceAfter: number, id: string) =>
    sqlite
      .prepare(
        `
          INSERT INTO credit_ledger (
            id, user_id, kind, source, amount, balance_after, idempotency_key
          )
          VALUES (?, 'user-1', 'grant', 'manual_adjustment', ?, ?, ?)
        `,
      )
      .run(id, amount, balanceAfter, id);

  it('rejects fractional ledger amounts', () => {
    expect(() => insertLedger(1.5, 1.5, 'fractional')).toThrow('INVALID_CREDIT_AMOUNT');
  });

  it('rejects balances beyond the JavaScript safe integer domain', () => {
    sqlite
      .prepare('UPDATE credit_accounts SET balance = ? WHERE user_id = ?')
      .run(Number.MAX_SAFE_INTEGER, 'user-1');

    expect(() => insertLedger(1, Number.MAX_SAFE_INTEGER + 1, 'overflow')).toThrow(
      'CREDIT_BALANCE_OVERFLOW',
    );
  });
});
