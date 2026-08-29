import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAppQueryClient } from '@/lib/queryClient';
import { shareStateOptions } from '@/queries/share';

describe('share queries', () => {
  const client = createAppQueryClient();

  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });

  it('retries temporary storage failures and returns the shared state', async () => {
    const state = {
      tableName: 'shared_orders',
      tableComment: '',
      dbType: 'mysql',
      rows: [],
      indexes: [],
      schemaName: '',
      sqlFormatMode: 'compact',
      addCount: 10,
      authInput: '',
      authObjects: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Share read failed', code: 'SHARE_LOAD_FAILED' }), {
          status: 502,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ state })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.fetchQuery({ ...shareStateOptions('share-id'), retryDelay: 0 }),
    ).resolves.toMatchObject(state);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { status: 404, code: 'SHARE_NOT_FOUND', attempts: 1 },
    { status: 502, code: 'SHARE_LOAD_FAILED', attempts: 2 },
  ])('preserves $status after $attempts attempts', async ({ status, code, attempts }) => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response(JSON.stringify({ error: 'Share unavailable', code }), { status }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      client.fetchQuery({ ...shareStateOptions('share-id'), retryDelay: 0 }),
    ).rejects.toMatchObject({ status, code });
    expect(fetchMock).toHaveBeenCalledTimes(attempts);
  });
});
