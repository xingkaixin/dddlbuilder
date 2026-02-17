import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePersistedState } from '@/hooks';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import {
  setupFakeIndexedDB,
  teardownFakeIndexedDB,
} from '@/__tests__/utils/fakeIndexedDb';
import { STORAGE_KEY } from '@/utils/constants';
import { getShareState, ShareApiError } from '@/services/shareService';
import type { WorkspaceSavePayload } from '@/types/workspace';
import {
  readGlobalDraft,
  readSavedDraft,
  readWorkspaceSession,
  writeGlobalDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';

const GLOBAL_DRAFT_STORAGE_KEY = `${STORAGE_KEY}:draft:global:v1`;
const SAVED_TABLE_DRAFTS_STORAGE_KEY = `${STORAGE_KEY}:draft:saved:v1`;
const WORKSPACE_SESSION_STORAGE_KEY = `${STORAGE_KEY}:workspace:v1`;

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  configurable: true,
  writable: true,
});

vi.mock('@/services/shareService', () => ({
  getShareState: vi.fn(),
  ShareApiError: class ShareApiError extends Error {
    code?: string;
    status: number;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'ShareApiError';
      this.status = status;
      this.code = code;
    }
  },
}));

const mockedGetShareState = vi.mocked(getShareState);
const VALID_SHARE_ID = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';

const createState = (tableName: string) => ({
  tableName,
  tableComment: '',
  dbType: 'mysql' as const,
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('usePersistedState', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    localStorageMock.clear();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('应迁移 localStorage 全局草稿到 IndexedDB 并恢复', async () => {
    const draftState = createState('global_from_legacy');
    localStorageMock.setItem(
      GLOBAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ state: draftState, updatedAt: Date.now() }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toEqual(draftState);
      expect(result.current.activeSource).toEqual({ kind: 'global_draft' });
    });

    const dbDraft = await readGlobalDraft();
    expect(dbDraft?.state.tableName).toBe('global_from_legacy');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(
      GLOBAL_DRAFT_STORAGE_KEY,
    );
  });

  it('保存全局草稿时应写入 IndexedDB 全局草稿和工作区会话', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    const payload: WorkspaceSavePayload = {
      state: createState('next_global'),
      source: { kind: 'global_draft' },
      isDirty: false,
    };

    act(() => {
      result.current.saveState(payload);
    });

    expect(result.current.getGlobalDraftState()?.tableName).toBe('next_global');

    await waitFor(async () => {
      const dbDraft = await readGlobalDraft();
      expect(dbDraft?.state.tableName).toBe('next_global');
      const session = await readWorkspaceSession();
      expect(session?.activeSource).toEqual({ kind: 'global_draft' });
    });
  });

  it('保存已保存表草稿时应写入 IndexedDB，并在 clean 时删除', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.saveState({
        state: createState('users_draft'),
        source: {
          kind: 'saved_table',
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: '{"table":"users"}',
        },
        isDirty: true,
      });
    });

    await waitFor(async () => {
      const draft = await readSavedDraft('users');
      expect(draft?.state.tableName).toBe('users_draft');
    });

    act(() => {
      result.current.saveState({
        state: createState('users'),
        source: {
          kind: 'saved_table',
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: '{"table":"users"}',
        },
        isDirty: false,
      });
    });

    await waitFor(async () => {
      const draft = await readSavedDraft('users');
      expect(draft).toBeNull();
    });
  });

  it('应根据 IndexedDB 会话恢复已保存表草稿上下文', async () => {
    const draftState = createState('users_draft');
    await writeWorkspaceSession({
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: '{"table":"users"}',
      },
      activeState: draftState,
      updatedAt: Date.now(),
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
      expect(result.current.persistedState).toEqual(draftState);
    });
  });

  it('重命名和删除草稿 API 应写入 IndexedDB', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.saveState({
        state: createState('users_draft'),
        source: {
          kind: 'saved_table',
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: '{"table":"users"}',
        },
        isDirty: true,
      });
    });

    await waitFor(async () => {
      expect(await readSavedDraft('users')).not.toBeNull();
    });

    act(() => {
      result.current.renameSavedTableDraft('users', 'users_new', 'Users New');
    });

    await waitFor(async () => {
      const oldDraft = await readSavedDraft('users');
      const newDraft = await readSavedDraft('users_new');
      expect(oldDraft).toBeNull();
      expect(newDraft?.tableName).toBe('Users New');
    });

    act(() => {
      result.current.removeSavedTableDraft('users_new');
    });

    await waitFor(async () => {
      const draft = await readSavedDraft('users_new');
      expect(draft).toBeNull();
    });
  });

  it('分享路径应加载远端状态', async () => {
    const sharedState = createState('shared_users');
    mockedGetShareState.mockResolvedValue(sharedState as any);
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toEqual(sharedState);
      expect(result.current.isShareView).toBe(true);
    });
  });

  it('分享不存在时应回跳首页并恢复主工作区', async () => {
    await writeGlobalDraft({
      state: createState('global_after_share_fail'),
      updatedAt: Date.now(),
    });
    mockedGetShareState.mockRejectedValue(
      new ShareApiError('Share not found', 404, 'SHARE_NOT_FOUND'),
    );
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.shareLoadStatus).toBe('not_found');
      expect(result.current.persistedState).toEqual(
        createState('global_after_share_fail'),
      );
      expect(result.current.isShareView).toBe(false);
    });
  });

  it('应迁移 localStorage 保存表草稿与会话到 IndexedDB', async () => {
    const draftState = createState('users_legacy_draft');
    localStorageMock.setItem(
      SAVED_TABLE_DRAFTS_STORAGE_KEY,
      JSON.stringify({
        users: {
          state: draftState,
          tableName: 'Users',
          baseSignature: '{"table":"users"}',
          updatedAt: Date.now(),
        },
      }),
    );
    localStorageMock.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({
        activeSource: {
          kind: 'saved_table',
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: '{"table":"users"}',
        },
        activeState: draftState,
        updatedAt: Date.now(),
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
      expect(result.current.persistedState).toEqual(draftState);
    });

    await waitFor(async () => {
      expect(await readSavedDraft('users')).not.toBeNull();
      const session = await readWorkspaceSession();
      expect(session?.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
    });
  });
});
