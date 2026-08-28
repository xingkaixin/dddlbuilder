import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb, VERSION_STORE_NAME, REVIEW_STORE_NAME } from '@/utils/workspaceDb';
import { updateSavedTables } from '@/utils/savedTablesDb';

function mockOpen() {
  const transaction = {
    error: new Error('写入失败'),
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    oncomplete: null as (() => void) | null,
    objectStore: () => ({ put: vi.fn() }),
  };
  const db = {
    close: vi.fn(),
    onversionchange: null as (() => void) | null,
    transaction: () => transaction,
  };
  const request = {
    result: db,
    onsuccess: null as (() => void) | null,
    onblocked: null as (() => void) | null,
  };
  vi.stubGlobal('indexedDB', { open: () => request });
  return { db, request, transaction };
}

afterEach(() => vi.unstubAllGlobals());

describe('workspace database lifecycle', () => {
  it('assigns unscoped history to the anonymous partition during the version upgrade', async () => {
    const cursors = [VERSION_STORE_NAME, REVIEW_STORE_NAME].map((storeName) => ({
      storeName,
      result: {
        value: { id: storeName, tableNormalizedName: 'orders' },
        update: vi.fn(),
        continue: vi.fn(),
      },
      onsuccess: null as (() => void) | null,
    }));
    const request = {
      result: { objectStoreNames: { contains: () => true }, close: vi.fn(), onversionchange: null },
      transaction: {
        objectStore: (name: string) => ({
          indexNames: { contains: () => true },
          openCursor: () => cursors.find((cursor) => cursor.storeName === name),
        }),
      },
      onupgradeneeded: null as ((event: { oldVersion: number }) => void) | null,
      onsuccess: null as (() => void) | null,
    };
    vi.stubGlobal('indexedDB', { open: () => request });
    const opened = openDb();
    request.onupgradeneeded?.({ oldVersion: 14 });
    for (const cursor of cursors) {
      cursor.onsuccess?.();
      expect(cursor.result.update).toHaveBeenCalledWith({
        id: cursor.storeName,
        tableNormalizedName: 'orders',
        tableId: 'legacy:orders',
        tableKey: 'anonymous::legacy:orders',
      });
    }
    request.onsuccess?.();
    await opened;
  });
  it('rejects a blocked upgrade and closes a connection delivered afterwards', async () => {
    const { db, request } = mockOpen();
    let settled = false;
    const result = openDb().catch((error: unknown) => {
      settled = true;
      return error;
    });
    request.onblocked?.();
    await Promise.resolve();
    expect(settled).toBe(true);
    expect(await result).toBeInstanceOf(Error);
    request.onsuccess?.();
    expect(db.close).toHaveBeenCalledOnce();
  });

  it('closes old connections when another tab upgrades the database', async () => {
    const { db, request } = mockOpen();
    const result = openDb();
    request.onsuccess?.();
    await result;
    db.onversionchange?.();
    expect(db.close).toHaveBeenCalledOnce();
  });

  it.each(['onerror', 'onabort'] as const)('closes a failed batch on %s', async (event) => {
    const { db, request, transaction } = mockOpen();
    const result = updateSavedTables(
      [{ normalizedName: 'demo', name: 'Demo', state: {} as never, createdAt: 1, updatedAt: 1 }],
      { kind: 'anonymous' },
    );
    request.onsuccess?.();
    await Promise.resolve();
    transaction[event]?.();
    await expect(result).rejects.toThrow('写入失败');
    expect(db.close).toHaveBeenCalledOnce();
  });
});
