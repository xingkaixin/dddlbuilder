import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { URL } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = new URL('../../../../../packages/db/migrations/', import.meta.url);
const windowMigration = '0020_ai_daily_budget_windows.sql';

const createLegacyDatabase = () => {
  const sqlite = new DatabaseSync(':memory:');
  const files = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql') && file < windowMigration)
    .sort();
  for (const file of files) {
    sqlite.exec(readFileSync(new URL(file, migrationsDirectory), 'utf8'));
  }
  sqlite
    .prepare(
      "INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('u', 'U', 'u@example.com', 1, 1)",
    )
    .run();
  return sqlite;
};

const migrateBudgetWindows = (sqlite: DatabaseSync) => {
  sqlite.exec(readFileSync(new URL(windowMigration, migrationsDirectory), 'utf8'));
};

describe('AI daily budget window migration', () => {
  it.each([
    { legacyValue: 15, expectedOldDay: 75 },
    { legacyValue: 100, expectedOldDay: 100 },
  ])(
    'preserves reservations and legacy usage with counter $legacyValue',
    ({ legacyValue, expectedOldDay }) => {
      const sqlite = createLegacyDatabase();
      try {
        const reserve = (id: string, window: string, amount: number) => {
          sqlite
            .prepare(`INSERT INTO usage_events (
            id, user_id, route_key, request_id, estimated_tokens, status
          ) VALUES (?, 'u', 'explain', ?, ?, 'reserved')`)
            .run(id, id, amount);
          sqlite
            .prepare(`INSERT INTO ai_budget_reservations (
            usage_event_id, window_id, reserved_tokens, limit_tokens, expires_at, created_at
          ) VALUES (?, ?, ?, 1000, 2000, 1)`)
            .run(id, window, amount);
        };
        const settle = (id: string, actual: number) => {
          sqlite
            .prepare(
              'UPDATE ai_budget_reservations SET actual_tokens = ?, settled_at = 2 WHERE usage_event_id = ?',
            )
            .run(actual, id);
        };

        reserve('old-pending', '20260830', 40);
        reserve('old-settled', '20260830', 30);
        settle('old-settled', 20);
        reserve('new-pending', '20260831', 40);
        reserve('new-settled', '20260831', 20);
        settle('new-settled', 10);
        reserve('old-late', '20260830', 15);
        sqlite
          .prepare("UPDATE ai_governance_counters SET value = ? WHERE scope = 'daily-budget'")
          .run(legacyValue);
        sqlite
          .prepare(`INSERT INTO ai_governance_counters
        (scope, subject, window_id, value, expires_at)
        VALUES ('rate:explain', 'u', 'w', 3, 3000)`)
          .run();

        migrateBudgetWindows(sqlite);

        expect(
          sqlite
            .prepare('SELECT window_id, value FROM ai_daily_budget_counters ORDER BY window_id')
            .all(),
        ).toEqual([
          { window_id: '20260830', value: expectedOldDay },
          { window_id: '20260831', value: 50 },
        ]);
        expect(
          sqlite
            .prepare('SELECT scope, subject, window_id, value FROM ai_governance_counters')
            .all(),
        ).toEqual([{ scope: 'rate:explain', subject: 'u', window_id: 'w', value: 3 }]);
        expect(
          sqlite
            .prepare('SELECT COUNT(*) AS n FROM ai_budget_reservations WHERE actual_tokens IS NULL')
            .get()?.n,
        ).toBe(3);

        settle('old-pending', 5);
        settle('old-late', 10);
        expect(
          sqlite
            .prepare('SELECT window_id, value FROM ai_daily_budget_counters ORDER BY window_id')
            .all(),
        ).toEqual([
          { window_id: '20260830', value: expectedOldDay - 40 },
          { window_id: '20260831', value: 50 },
        ]);
        reserve('new-next', '20260831', 950);
        expect(() => reserve('new-over-limit', '20260831', 1)).toThrow('BUDGET_EXCEEDED');
      } finally {
        sqlite.close();
      }
    },
  );

  it('preserves counters created before reservation tracking existed', () => {
    const sqlite = createLegacyDatabase();
    try {
      sqlite
        .prepare(`INSERT INTO ai_governance_counters
        (scope, subject, window_id, value, expires_at)
        VALUES ('daily-budget', 'global', '20260830', 500, 2000)`)
        .run();
      migrateBudgetWindows(sqlite);
      expect(
        sqlite.prepare('SELECT window_id, value, expires_at FROM ai_daily_budget_counters').all(),
      ).toEqual([{ window_id: '20260830', value: 500, expires_at: 2000 }]);
    } finally {
      sqlite.close();
    }
  });
});
