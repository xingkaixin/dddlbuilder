import { describe, expect, it, vi } from 'vitest';
import { runIndexedDbRequest } from '@/utils/indexedDbTransaction';

type RequestHandlers<T> = {
  result: T;
  error: Error | null;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
};

type TransactionHandlers = {
  error: Error | null;
  oncomplete: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  objectStore: () => IDBObjectStore;
  abort: ReturnType<typeof vi.fn>;
};

const createHarness = <T>(result: T) => {
  const request: RequestHandlers<T> = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  // SAFETY: The transaction tests only pass this object through objectStore; no store methods are invoked.
  const store = {} as IDBObjectStore;

  const transaction: TransactionHandlers = {
    error: null,
    oncomplete: null,
    onerror: null,
    onabort: null,
    objectStore: () => store,
    abort: vi.fn(),
  };
  const close = vi.fn();

  // SAFETY: This test double implements the transaction and close members consumed by the helper.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- The harness intentionally omits unrelated IDBDatabase fields.
  const db = {
    transaction: vi.fn(() => transaction),
    close,
  } as unknown as IDBDatabase;

  return { request, store, transaction, close, db };
};

describe('runIndexedDbRequest', () => {
  it('rejects when a successful request is followed by a transaction abort', async () => {
    const harness = createHarness('not-committed');

    const result = runIndexedDbRequest(
      harness.db,
      'records',
      'readwrite',
      // SAFETY: The harness invokes only IDBRequest callbacks and reads result/error through this test double.
      // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- The harness intentionally omits unrelated IDBRequest fields.
      () => harness.request as unknown as IDBRequest<string>,
    );

    harness.request.onsuccess?.();
    harness.transaction.error = new Error('commit failed');
    harness.transaction.onabort?.();

    await expect(result).rejects.toThrow('commit failed');
    expect(harness.close).toHaveBeenCalledOnce();
  });
});
