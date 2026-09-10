import { describe, expect, it, vi } from 'vitest';

type Behavior = 'get_request_error_null' | 'get_tx_error_null' | 'idle';

const mocks = vi.hoisted(() => ({
  // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
  behavior: 'idle' as Behavior,
  openDb: vi.fn(async () => {
    const createRequest = () => ({
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      result: undefined as any,
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      error: null as any,
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      onsuccess: null as null | (() => void),
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      onerror: null as null | (() => void),
    });

    let pendingRequests = 0;

    const completeRequest = (request: ReturnType<typeof createRequest>) => {
      pendingRequests += 1;
      queueMicrotask(() => {
        request.onsuccess?.();
        pendingRequests -= 1;

        if (pendingRequests === 0) queueMicrotask(() => tx.oncomplete?.());
      });
    };

    const createTransaction = () => ({
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      error: null as any,
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      onerror: null as null | (() => void),
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      onabort: null as null | (() => void),
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      oncomplete: null as null | (() => void),
      objectStore: () => ({
        get: () => {
          const req = createRequest();

          if (mocks.behavior === 'get_request_error_null') {
            queueMicrotask(() => req.onerror?.());
          } else if (mocks.behavior === 'get_tx_error_null') {
            queueMicrotask(() => tx.onerror?.());
          }

          // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
          return req as any;
        },
        index: () => ({
          getAll: () => {
            const req = createRequest();
            req.result = [];
            completeRequest(req);

            // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
            return req as any;
          },
          count: () => {
            const req = createRequest();
            req.result = 0;
            completeRequest(req);

            // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
            return req as any;
          },
        }),
      }),
    });

    const tx = createTransaction();

    // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
    return {
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
      transaction: () => tx as any,
      close: vi.fn(),
      // SAFETY: This IndexedDB double provides the minimal event-shaped values exercised by the branch.
    } as any;
  }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- IndexedDB 模块替换提供可控请求和事务错误，覆盖内部错误回退分支。
vi.mock('@/utils/workspaceDb', () => ({
  VERSION_STORE_NAME: 'table_versions',
  openDb: mocks.openDb,
}));

import { getVersion, listVersions } from '@/utils/tableVersions';

const target = {
  scope: { kind: 'anonymous' } as const,
  tableId: 't',
  normalizedName: 't',
};

describe('tableVersions internal branches', () => {
  it('should fallback to default request error when request.error is null', async () => {
    mocks.behavior = 'get_request_error_null';
    await expect(getVersion('v1', target)).rejects.toThrow('IndexedDB 请求失败');
  });

  it('should fallback to default tx error when tx.error is null', async () => {
    mocks.behavior = 'get_tx_error_null';
    await expect(getVersion('v1', target)).rejects.toThrow('IndexedDB 事务失败');
  });

  it('returns an empty list when the table has no versions', async () => {
    mocks.behavior = 'idle';
    await expect(listVersions(target)).resolves.toEqual([]);
  });
});
