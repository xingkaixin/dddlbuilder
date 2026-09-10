import { vi } from 'vitest';

export const createDurableObjectState = (store = new Map<string, unknown>()) => {
  let transactions: Promise<void> = Promise.resolve();

  // SAFETY: the fake state implements every DurableObjectState member exercised by these tests.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the fake state implements only the Durable Object surface used by tests.
  const state = {
    storage: {
      get: vi.fn(async (key: string) => store.get(key)),
      // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Durable Object storage accepts arbitrary persisted values.
      put: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => store.delete(key)),
      list: vi.fn(
        async (options?: { prefix?: string }) =>
          new Map([...store].filter(([key]) => !options?.prefix || key.startsWith(options.prefix))),
      ),
      getAlarm: vi.fn(async () => null),
      setAlarm: vi.fn(async () => undefined),
      transaction: vi.fn((callback: (transaction: DurableObjectTransaction) => Promise<void>) => {
        const result = transactions.then(async () => {
          const before = new Map(store);

          try {
            // SAFETY: the fake storage implements every transaction method used by the Durable Object code.
            // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the transaction fixture reuses its storage surface.
            return await callback(state.storage as unknown as DurableObjectTransaction);
          } catch (error) {
            store.clear();

            for (const [key, value] of before) store.set(key, value);
            throw error;
          }
        });
        transactions = result.catch(() => undefined);

        return result;
      }),
    },
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    waitUntil: vi.fn(),
  } as unknown as DurableObjectState;

  return { state, store };
};
