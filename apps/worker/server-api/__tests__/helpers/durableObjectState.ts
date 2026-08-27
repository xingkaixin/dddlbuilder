import { vi } from 'vitest';

export const createDurableObjectState = (store = new Map<string, unknown>()) => {
  let transactions: Promise<unknown> = Promise.resolve();
  const state = {
    storage: {
      get: vi.fn(async (key: string) => store.get(key)),
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
      transaction: vi.fn(
        (callback: (transaction: DurableObjectTransaction) => Promise<unknown>) => {
          const result = transactions.then(async () => {
            const before = new Map(store);
            try {
              return await callback(state.storage as unknown as DurableObjectTransaction);
            } catch (error) {
              store.clear();
              for (const [key, value] of before) store.set(key, value);
              throw error;
            }
          });
          transactions = result.catch(() => undefined);
          return result;
        },
      ),
    },
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    waitUntil: vi.fn(),
  } as unknown as DurableObjectState;
  return { state, store };
};
