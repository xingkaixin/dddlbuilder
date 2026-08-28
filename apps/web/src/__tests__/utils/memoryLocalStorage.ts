import { vi } from 'vitest';

/** setup.ts 把 localStorage 换成了不存储的 vi.fn()，需要真实读写语义的用例用它装上内存实现。 */
export const setupMemoryLocalStorage = () => {
  const store = new Map<string, string>();
  Object.defineProperty(localStorage, 'length', { configurable: true, get: () => store.size });
  Object.defineProperty(localStorage, 'key', {
    configurable: true,
    value: (index: number) => [...store.keys()][index] ?? null,
  });
  vi.mocked(localStorage.getItem).mockImplementation((key: string) => store.get(key) ?? null);
  vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
    store.set(key, String(value));
  });
  vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
    store.delete(key);
  });
  vi.mocked(localStorage.clear).mockImplementation(() => {
    store.clear();
  });
  return store;
};
