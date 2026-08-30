import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { vi } from 'vitest';

export const createFakeIndexedDB = () => new IDBFactory();

export const setupFakeIndexedDB = () => {
  const factory = createFakeIndexedDB();

  Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    value: IDBKeyRange,
    writable: true,
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: factory,
    writable: true,
  });

  return factory;
};

export const teardownFakeIndexedDB = () => {
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    configurable: true,
    value: undefined,
    writable: true,
  });
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: undefined,
    writable: true,
  });
  vi.restoreAllMocks();
};
