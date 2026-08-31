import { afterEach, describe, expect, it, vi } from 'vitest';
import { openDb } from '@/utils/workspaceDb';
import { updateSavedTables } from '@/utils/savedTablesDb';

function mockOpen() {
  const transaction = {
    error: new Error('写入失败'),
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    oncomplete: null as (() => void) | null,
    objectStore: () => ({
      get: () => ({ onerror: null, onsuccess: null }),
      put: vi.fn(),
    }),
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
