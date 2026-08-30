import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = decodeURIComponent(
  new URL('../../../../../packages/db/migrations/', import.meta.url).pathname,
);

const applyThrough = (sqlite: DatabaseSync, through: string) => {
  const files = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql') && file <= through)
    .sort();
  for (const file of files) {
    sqlite.exec(readFileSync(`${migrationsDirectory}/${file}`, 'utf8'));
  }
};

describe('AI usage accounting migration', () => {
  it('preserves historical charges without inventing attempt counts', () => {
    const sqlite = new DatabaseSync(':memory:');
    try {
      applyThrough(sqlite, '0018_unify_timestamp_storage.sql');
      const cases = [
        { id: 'succeeded', status: 'succeeded', actual: 60, refund: 40 },
        { id: 'failed', status: 'failed', actual: 150, refund: null },
        { id: 'pending', status: 'pending', actual: null, refund: null, reserve: false },
        { id: 'settling-failed-known', status: 'settling_failed', actual: 60, refund: null },
        { id: 'settling-failed-unknown', status: 'settling_failed', actual: null, refund: 100 },
        { id: 'settling-succeeded', status: 'settling_succeeded', actual: 60, refund: null },
        { id: 'settling-succeeded-over', status: 'settling_succeeded', actual: 150, refund: null },
        { id: 'reclaiming-known', status: 'reclaiming', actual: 60, refund: null },
        { id: 'reclaiming-unknown', status: 'reclaiming', actual: null, refund: null },
      ] as const;

      for (const item of cases) {
        sqlite
          .prepare(
            'INSERT INTO user (id, name, email, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
          )
          .run(item.id, item.id, `${item.id}@example.com`);
        sqlite
          .prepare('INSERT INTO credit_accounts (user_id, balance, version) VALUES (?, 1000, 0)')
          .run(item.id);
        sqlite
          .prepare(`INSERT INTO usage_events (
            id, user_id, route_key, request_id, estimated_tokens,
            actual_total_tokens, status, created_at
          ) VALUES (?, ?, 'explain', ?, 100, ?, ?, 1)`)
          .run(item.id, item.id, `request-${item.id}`, item.actual, item.status);
        if (!('reserve' in item) || item.reserve !== false) {
          sqlite
            .prepare(`INSERT INTO credit_ledger (
              id, user_id, kind, source, amount, balance_after,
              idempotency_key, related_usage_id, created_at
            ) VALUES (?, ?, 'consume', 'ai_explain', 100, 900, ?, ?, 1)`)
            .run(`reserve-${item.id}`, item.id, `${item.id}:reserve`, item.id);
        }
        if (item.refund !== null) {
          sqlite
            .prepare(`INSERT INTO credit_ledger (
              id, user_id, kind, source, amount, balance_after,
              idempotency_key, related_usage_id, created_at
            ) VALUES (?, ?, 'refund', 'ai_explain', ?, ?, ?, ?, 2)`)
            .run(
              `refund-${item.id}`,
              item.id,
              item.refund,
              900 + item.refund,
              `${item.id}:settlement`,
              item.id,
            );
        }
      }

      sqlite
        .prepare(`INSERT INTO ai_budget_reservations (
          usage_event_id, window_id, reserved_tokens, actual_tokens,
          limit_tokens, expires_at, settled_at, created_at
        ) VALUES ('succeeded', '20260830', 100, NULL, 1000, 9999999999999, NULL, 1)`)
        .run();
      sqlite
        .prepare(`UPDATE ai_budget_reservations
          SET actual_tokens = 60, settled_at = 2
          WHERE usage_event_id = 'succeeded'`)
        .run();

      sqlite.exec(
        readFileSync(`${migrationsDirectory}/0019_ai_usage_attempt_accounting.sql`, 'utf8'),
      );

      expect(
        sqlite
          .prepare(`SELECT id, charged_tokens, provider_budget_tokens,
            attempt_count, usage_is_estimated
            FROM usage_events ORDER BY id`)
          .all(),
      ).toEqual([
        {
          id: 'failed',
          charged_tokens: 100,
          provider_budget_tokens: 150,
          attempt_count: null,
          usage_is_estimated: 1,
        },
        {
          id: 'pending',
          charged_tokens: 0,
          provider_budget_tokens: 0,
          attempt_count: 0,
          usage_is_estimated: 0,
        },
        {
          id: 'reclaiming-known',
          charged_tokens: 60,
          provider_budget_tokens: 100,
          attempt_count: null,
          usage_is_estimated: 1,
        },
        {
          id: 'reclaiming-unknown',
          charged_tokens: 0,
          provider_budget_tokens: 100,
          attempt_count: null,
          usage_is_estimated: 1,
        },
        {
          id: 'settling-failed-known',
          charged_tokens: 60,
          provider_budget_tokens: 100,
          attempt_count: null,
          usage_is_estimated: 1,
        },
        {
          id: 'settling-failed-unknown',
          charged_tokens: 0,
          provider_budget_tokens: 100,
          attempt_count: null,
          usage_is_estimated: 1,
        },
        {
          id: 'settling-succeeded',
          charged_tokens: 60,
          provider_budget_tokens: 100,
          attempt_count: null,
          usage_is_estimated: 1,
        },
        {
          id: 'settling-succeeded-over',
          charged_tokens: 150,
          provider_budget_tokens: 150,
          attempt_count: null,
          usage_is_estimated: 1,
        },
        {
          id: 'succeeded',
          charged_tokens: 60,
          provider_budget_tokens: 60,
          attempt_count: null,
          usage_is_estimated: 1,
        },
      ]);
      expect(
        sqlite
          .prepare(`SELECT r.actual_tokens, c.value
            FROM ai_budget_reservations r
            JOIN ai_governance_counters c
              ON c.scope = 'daily-budget'
              AND c.subject = 'global'
              AND c.window_id = r.window_id
            WHERE r.usage_event_id = 'succeeded'`)
          .get(),
      ).toEqual({ actual_tokens: 60, value: 60 });
    } finally {
      sqlite.close();
    }
  });
});
