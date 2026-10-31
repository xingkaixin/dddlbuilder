import { DatabaseSync } from 'node:sqlite';
import type { ApiEnv } from '../../lib/context.js';
import { AIConversationDurableObject } from '../../lib/aiConversationDurableObject.js';
import { createCreditFixture } from './creditFixture.js';

export const createAIRuntimeFixture = async (
  options: { balance?: number; directory?: string; bindings?: Partial<ApiEnv['Bindings']> } = {},
) => {
  const test = await createCreditFixture(
    options.balance ?? 100_000,
    options.directory ? `${options.directory}/d1.sqlite` : undefined,
  );
  test.sqlite
    .prepare(
      "INSERT OR IGNORE INTO session (id, user_id, token, expires_at, created_at, updated_at) VALUES ('session', 'user-1', 'token', ?, 1, 1)",
    )
    .run(Date.now() + 600_000);
  test.sqlite
    .prepare(
      "INSERT OR IGNORE INTO ai_conversations (id, user_id, route_key, created_at, expires_at) VALUES ('conversation', 'user-1', 'explain', 1, ?)",
    )
    .run(Date.now() + 600_000);
  test.sqlite
    .prepare(
      "INSERT OR IGNORE INTO ai_operations (id, conversation_id, user_id, session_id, submitted_at, deadline_at, created_at) VALUES ('operation', 'conversation', 'user-1', 'session', 1, ?, 1)",
    )
    .run(Date.now() + 600_000);

  const sqlite = new DatabaseSync(
    options.directory ? `${options.directory}/durable.sqlite` : ':memory:',
  );
  const pending: Promise<unknown>[] = [];

  let alarmAt = 0;
  let deleted = false;

  const storage = {
    sql: {
      exec(query: string, ...bindings: (string | number | null)[]) {
        const statement = sqlite.prepare(query);
        const rows = statement.all(...bindings);
        const cursor = rows.values();

        return { next: () => cursor.next(), toArray: () => rows };
      },
    },
    async transaction<T>(callback: () => Promise<T>) {
      sqlite.exec('BEGIN');

      try {
        const result = await callback();
        sqlite.exec('COMMIT');

        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    setAlarm: async (at: number) => {
      alarmAt = at;
    },
    deleteAll: async () => {
      deleted = true;
    },
  };
  // SAFETY: this fixture implements the SQLite transaction and lifecycle surface used by the AI DO.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- Test adapter implements only the DO APIs consumed by pi-durable.
  const ctx = {
    storage,
    blockConcurrencyWhile: (callback: () => Promise<void>) => callback(),
    waitUntil: (promise: Promise<unknown>) => pending.push(promise),
  } as unknown as DurableObjectState;
  const runtime = new AIConversationDurableObject(ctx, {
    ...test.env,
    ANTHROPIC_API_KEY: 'test-key',
    ...options.bindings,
  });

  return {
    ...test,
    runtime,
    durableSqlite: sqlite,
    get alarmAt() {
      return alarmAt;
    },
    get deleted() {
      return deleted;
    },
    async finish() {
      for (let i = 0; i < pending.length; i++) await pending[i];
    },
  };
};
