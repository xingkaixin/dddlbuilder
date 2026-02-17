import { describe, expect, it, vi } from 'vitest';

type Behavior =
  | 'get_request_error_null'
  | 'get_tx_error_null'
  | 'list_result_undefined'
  | 'list_rows_missing'
  | 'idle';

const mocks = vi.hoisted(() => ({
  behavior: 'idle' as Behavior,
  openDb: vi.fn(async () => {
    const createRequest = () => ({
      result: undefined as any,
      error: null as any,
      onsuccess: null as null | (() => void),
      onerror: null as null | (() => void),
    });

    const createTransaction = () => ({
      error: null as any,
      onerror: null as null | (() => void),
      oncomplete: null as null | (() => void),
      objectStore: () => ({
        get: () => {
          const req = createRequest();
          if (mocks.behavior === 'get_request_error_null') {
            queueMicrotask(() => req.onerror?.());
          } else if (mocks.behavior === 'get_tx_error_null') {
            queueMicrotask(() => tx.onerror?.());
          }
          return req as any;
        },
        index: () => ({
          getAll: () => {
            const req = createRequest();
            if (mocks.behavior === 'list_rows_missing') {
              req.result = [
                {
                  id: 'v1',
                  tableNormalizedName: 't',
                  message: 'm',
                  createdAt: 1,
                  state: { dbType: 'mysql' },
                },
              ];
            } else if (mocks.behavior === 'list_result_undefined') {
              req.result = undefined;
            } else {
              req.result = [];
            }
            queueMicrotask(() => {
              req.onsuccess?.();
              tx.oncomplete?.();
            });
            return req as any;
          },
          count: () => {
            const req = createRequest();
            req.result = 0;
            queueMicrotask(() => {
              req.onsuccess?.();
              tx.oncomplete?.();
            });
            return req as any;
          },
        }),
      }),
    });

    const tx = createTransaction();

    return {
      transaction: () => tx as any,
      close: vi.fn(),
    } as any;
  }),
}));

vi.mock('@/utils/savedTablesDb', () => ({
  VERSION_STORE_NAME: 'table_versions',
  openDb: mocks.openDb,
}));

import {
  getVersion,
  listVersionMetadata,
  listVersions,
} from '@/utils/tableVersions';

describe('tableVersions internal branches', () => {
  it('should fallback to default request error when request.error is null', async () => {
    mocks.behavior = 'get_request_error_null';
    await expect(getVersion('v1')).rejects.toThrow('请求失败');
  });

  it('should fallback to default tx error when tx.error is null', async () => {
    mocks.behavior = 'get_tx_error_null';
    await expect(getVersion('v1')).rejects.toThrow('事务失败');
  });

  it('should fallback listVersions result to empty array', async () => {
    mocks.behavior = 'list_result_undefined';
    await expect(listVersions('t')).resolves.toEqual([]);
  });

  it('should fallback metadata fieldCount to 0 when rows are missing', async () => {
    mocks.behavior = 'list_rows_missing';
    const metadata = await listVersionMetadata('t');
    expect(metadata).toHaveLength(1);
    expect(metadata[0].fieldCount).toBe(0);
  });
});
