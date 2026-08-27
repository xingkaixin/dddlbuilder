import { vi } from 'vitest';

export const createDurableObjectState = (store = new Map<string, unknown>()) => ({
  state: {
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
    },
    acceptWebSocket: vi.fn(),
    getWebSockets: vi.fn(() => []),
    waitUntil: vi.fn(),
  } as unknown as DurableObjectState,
  store,
});
