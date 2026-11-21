import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildSchemaStateSignature } from '@ddlbuilder/workspace-core';
import { useShareAction } from '@/components/App/hooks/useShareAction';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { i18n } from '@/i18n';

const SHARE_LINK_CACHE_KEY = 'ddlbuilder:share:last:v2';

const sampleState: PersistedState = {
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  rows: [],
  indexes: [],
  authInput: '',
  authObjects: [],
  sqlFormatMode: 'compact',
  addCount: 10,
};

describe('useShareAction', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.mocked(localStorage.getItem).mockImplementation((key) => storage.get(key) ?? null);
    vi.mocked(localStorage.setItem).mockImplementation((key, value) => {
      storage.set(key, value);
    });
    vi.mocked(navigator.clipboard.writeText).mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.mocked(localStorage.getItem).mockReset();
    vi.mocked(localStorage.setItem).mockReset();
    vi.unstubAllGlobals();
  });

  it.each([
    'null',
    '[]',
    '123',
    JSON.stringify({
      signature: buildSchemaStateSignature(sampleState),
      url: 'https://example.com/s/bad',
      expiresAt: '9999999999999',
    }),
  ])('ignores invalid cached share payload (%s) and requests a new share link', async (raw) => {
    storage.set(SHARE_LINK_CACHE_KEY, raw);

    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: 'fresh-id',
        url: 'https://example.com/s/fresh',
        expiresInSeconds: 3600,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const showToast = vi.fn();
    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(
      () =>
        useShareAction({
          buildPersistedState: () => sampleState,
          showToast,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleShare();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/s/fresh');
    expect(showToast).toHaveBeenCalledWith(i18n.t('services.shareCopied'));
  });

  it('reuses a valid cached share link for the matching signature', async () => {
    storage.set(
      SHARE_LINK_CACHE_KEY,
      JSON.stringify({
        signature: buildSchemaStateSignature(sampleState),
        url: 'https://example.com/s/cached',
        expiresAt: Date.now() + 60_000,
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const showToast = vi.fn();
    const { wrapper } = createQueryClientWrapper();

    const { result } = renderHook(
      () =>
        useShareAction({
          buildPersistedState: () => sampleState,
          showToast,
        }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleShare();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://example.com/s/cached');
    expect(showToast).toHaveBeenCalledWith(i18n.t('services.shareCopiedReused'));
  });
});
