import { describe, expect, it, vi } from 'vitest';
import { runIndexedDbRequest, runIndexedDbTransaction } from '@/utils/indexedDbTransaction';

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
  const db = {
    transaction: vi.fn(() => transaction),
    close,
  } as unknown as IDBDatabase;

  return { request, store, transaction, close, db };
};

describe('runIndexedDbRequest', () => {
  it('aborts partial work and closes the connection when scheduling throws', async () => {
    const harness = createHarness(undefined);
    const error = new Error('DataCloneError');
    await expect(
      runIndexedDbTransaction(harness.db, 'records', 'readwrite', () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(harness.transaction.abort).toHaveBeenCalledOnce();
    harness.transaction.onabort?.();
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('closes the connection when a transaction cannot be created', async () => {
    const harness = createHarness(undefined);
    vi.mocked(harness.db.transaction).mockImplementation(() => {
      throw new Error('closed');
    });
    await expect(
      runIndexedDbTransaction(harness.db, 'records', 'readwrite', () => () => undefined),
    ).rejects.toThrow('closed');
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('can leave a shared connection open after committing', async () => {
    const harness = createHarness(undefined);
    const result = runIndexedDbTransaction(harness.db, 'records', 'readwrite', () => () => 2, {
      closeDatabase: false,
    });
    harness.transaction.oncomplete?.();
    await expect(result).resolves.toBe(2);
    expect(harness.close).not.toHaveBeenCalled();
  });
  it('resolves only after the transaction commits', async () => {
    const harness = createHarness('saved');
    let resolved = false;
    const result = runIndexedDbRequest(
      harness.db,
      'records',
      'readwrite',
      () => harness.request as unknown as IDBRequest<string>,
    ).then((value) => {
      resolved = true;
      return value;
    });

    harness.request.onsuccess?.();
    await Promise.resolve();
    expect(resolved).toBe(false);

    harness.transaction.oncomplete?.();
    await expect(result).resolves.toBe('saved');
    expect(harness.close).toHaveBeenCalledOnce();
  });

  it('rejects when a successful request is followed by a transaction abort', async () => {
    const harness = createHarness('not-committed');
    const result = runIndexedDbRequest(
      harness.db,
      'records',
      'readwrite',
      () => harness.request as unknown as IDBRequest<string>,
    );

    harness.request.onsuccess?.();
    harness.transaction.error = new Error('commit failed');
    harness.transaction.onabort?.();

    await expect(result).rejects.toThrow('commit failed');
    expect(harness.close).toHaveBeenCalledOnce();
  });
});
