import * as workspaceStateDb from '@/utils/workspaceStateDb';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { usePersistedSync } from '@/components/App/hooks/usePersistedSync';
import { useEditorStore } from '@/stores/editorStore';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import * as Y from 'yjs';
import { usePersistedState } from '@/hooks';
import { createQueryClientWrapper } from '@/__tests__/utils/queryClient';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { STORAGE_KEY } from '@/utils/constants';
import { useAuthIdentity, type AuthIdentityState } from '@/auth/AuthSessionProvider';
import { useWorkspaceYDocDocument } from '@/providers/WorkspaceYDocProvider';
import { getShareState, ShareApiError } from '@/services/shareService';
import type { WorkspaceSavePayload } from '@ddlbuilder/shared-types/workspace';
import {
  DEFAULT_DRAFT_ID,
  readDraft as readDraftInScope,
  readSavedDraft as readSavedDraftInScope,
  readWorkspaceSession as readWorkspaceSessionInScope,
  upsertSavedDraft as writeSavedDraftInScope,
  writeDraft as writeDraftInScope,
  writeWorkspaceSession as writeWorkspaceSessionInScope,
} from '@/utils/workspaceStateDb';
import { addSavedTable as addSavedTableInScope } from '@/utils/savedTablesDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';
import {
  getDraftRecordFromYDoc,
  upsertDraftInYDoc,
  upsertSavedTableInYDoc,
  upsertSavedDraftInYDoc,
  getSavedDraftFromYDoc,
  deleteSavedDraftFromYDoc,
} from '@/services/workspaceYDocAdapter';

const GLOBAL_DRAFT_STORAGE_KEY = `${STORAGE_KEY}:draft:global:v1`;
const WORKSPACE_SESSION_STORAGE_KEY = `${STORAGE_KEY}:workspace:v1`;
const anonymousScope = getAnonymousWorkspaceScope();

vi.mock('sonner', () => ({ toast: vi.fn() }));

const addSavedTable = (
  record: Parameters<typeof addSavedTableInScope>[0],
  scope = anonymousScope,
) => addSavedTableInScope(record, scope);
const readDraft = (draftId: Parameters<typeof readDraftInScope>[0], scope = anonymousScope) =>
  readDraftInScope(draftId, scope);
const readWorkspaceSession = (scope = anonymousScope) => readWorkspaceSessionInScope(scope);
const readSavedDraft = (normalizedName: string, scope = anonymousScope) =>
  readSavedDraftInScope(normalizedName, scope);
const writeDraft = (
  draftId: Parameters<typeof writeDraftInScope>[0],
  record: Parameters<typeof writeDraftInScope>[1],
  scope = anonymousScope,
) => writeDraftInScope(draftId, record, scope);
const writeWorkspaceSession = (
  record: Parameters<typeof writeWorkspaceSessionInScope>[0],
  scope = anonymousScope,
) => writeWorkspaceSessionInScope(record, scope);

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

vi.mock('@/auth/AuthSessionProvider', () => {
  const useAuthIdentity = vi.fn(() => ({
    status: 'signed_out',
    configured: true,
    userId: null,
    workspaceId: null,
    workspaceScope: null,
    email: null,
    name: null,
    emailVerified: false,
  }));
  return { useAuthIdentity };
});

vi.mock('@/providers/WorkspaceYDocProvider', () => ({
  useWorkspaceYDocDocument: vi.fn(() => ({
    doc: null,
    synced: false,
    localSynced: true,
    connectionState: 'idle',
    retry: vi.fn(),
  })),
}));

const mockedGetShareState = vi.mocked(getShareState);
const VALID_SHARE_ID = '8c6afce1-2a39-47aa-a14f-f3450c3ad7dd';
const SHARE_STORAGE_KEY = `${STORAGE_KEY}:share:${VALID_SHARE_ID}`;
const signedOutIdentity: AuthIdentityState = {
  status: 'signed_out',
  configured: true,
  userId: null,
  workspaceId: null,
  workspaceScope: null,
  email: null,
  name: null,
  emailVerified: false,
};
const signedInIdentity: AuthIdentityState = {
  status: 'signed_in',
  configured: true,
  userId: 'user-1',
  workspaceId: 'ws-1',
  workspaceScope: { kind: 'user', userId: 'user-1', workspaceId: 'ws-1' },
  email: 'user@example.com',
  name: 'User One',
  emailVerified: true,
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const useTestPersistedState = () => {
  const { status, document, drafts, savedTableDrafts } = usePersistedState();
  return { ...status, ...document, ...drafts, ...savedTableDrafts };
};

const createState = (tableName: string) => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql' as const,
  sqlFormatMode: 'compact' as const,
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const mockSignedInWorkspaceYDoc = (doc: Y.Doc, localSynced = true) => {
  vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);
  vi.mocked(useWorkspaceYDocDocument).mockReturnValue({
    doc,
    synced: false,
    localSynced,
    connectionState: 'connecting',
    retry: vi.fn(),
  });
};

describe('usePersistedState', () => {
  it('groups persistence capabilities by responsibility', () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => usePersistedState(), { wrapper });

    expect(Object.keys(result.current)).toEqual([
      'status',
      'document',
      'drafts',
      'savedTableDrafts',
    ]);
    expect(result.current.status).toHaveProperty('hydrated');
    expect(result.current.document).toHaveProperty('activeSource');
    expect(result.current.drafts).toHaveProperty('draftSummaries');
    expect(result.current.savedTableDrafts).toHaveProperty('getSavedTableDraft');
  });

  it('blocks writes after hydration fails and reloads existing data on retry', async () => {
    await writeDraft('default', { state: createState('kept'), updatedAt: 1 });
    const read = vi
      .spyOn(workspaceStateDb, 'readWorkspaceBootstrap')
      .mockRejectedValueOnce(new Error('blocked database'));
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => expect(result.current.hydrationFailed).toBe(true));
    expect(result.current.hydrated).toBe(false);
    act(() =>
      result.current.saveState({
        state: createState('overwrite'),
        source: { kind: 'draft', draftId: 'default' },
      }),
    );
    read.mockRestore();
    act(() => result.current.retryHydration());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.hydrationFailed).toBe(false);
    expect(result.current.persistedState?.tableName).toBe('kept');
  });

  it('does not publish a draft change when the YDoc write fails', async () => {
    const doc = new Y.Doc();
    const state = createState('users');
    upsertDraftInYDoc(doc, 'default', { state, updatedAt: 1 });
    mockSignedInWorkspaceYDoc(doc);
    const { wrapper } = createQueryClientWrapper();
    const { result, unmount } = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    let writeError: unknown;
    await act(async () => {
      try {
        result.current.saveState({
          source: { kind: 'draft', draftId: 'default' },
          state: {
            ...state,
            tableName: 'invalid',
            indexes: [
              { id: 'duplicate', name: 'first', fields: [], kind: 'index' },
              { id: 'duplicate', name: 'second', fields: [], kind: 'index' },
            ],
          },
        });
      } catch (error) {
        writeError = error;
      }
    });
    const name = result.current.draftSummaries[0]?.name;
    unmount();
    doc.destroy();
    expect(name).toBe('users');
    expect(writeError).toBeInstanceOf(Error);
  });

  it.each([1, 3])('远端保存清理草稿后恢复离线端未保存的修改，客户端 ID=%s', async (clientId) => {
    const doc = new Y.Doc();
    doc.clientID = 10;
    const base = createState('users');
    const target = { tableId: 'table-1', normalizedName: 'users' };
    const record = { ...target, name: 'Users', state: base, createdAt: 1, updatedAt: 1 };
    upsertSavedTableInYDoc(doc, record);
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    doc.clientID = clientId;
    remote.clientID = 2;
    mockSignedInWorkspaceYDoc(doc);
    const { wrapper } = createQueryClientWrapper();
    const { result, unmount } = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const loaded = result.current.resolveWorkspaceSnapshot({
      kind: 'saved_table',
      ...target,
      tableName: 'Users',
      baseSignature: '',
    });
    if (!loaded || loaded.source.kind !== 'saved_table')
      throw new Error('Saved table snapshot missing');
    act(() => result.current.selectWorkspaceSnapshot(loaded.source, loaded.state));
    await act(async () =>
      result.current.saveState({
        source: loaded.source,
        state: { ...loaded.state, tableComment: 'offline edit' },
      }),
    );
    expect(getSavedDraftFromYDoc(doc, target)?.state.tableComment).toBe('offline edit');
    upsertSavedDraftInYDoc(remote, target, {
      state: { ...base, tableComment: 'remote edit' },
      tableName: 'Users',
      baseSignature: loaded.source.baseSignature,
      updatedAt: 2,
    });
    upsertSavedTableInYDoc(remote, {
      ...record,
      state: { ...base, tableComment: 'remote edit', schemaName: 'app' },
      updatedAt: 3,
    });
    deleteSavedDraftFromYDoc(remote, target);
    act(() => Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote'));
    expect(result.current.persistedState).toMatchObject({
      tableComment: 'offline edit',
      schemaName: 'app',
    });
    expect(getSavedDraftFromYDoc(doc, target)?.state).toMatchObject({
      tableComment: 'offline edit',
    });
    expect(result.current.resolveWorkspaceSnapshot(loaded.source)?.state).toEqual(
      result.current.persistedState,
    );
    unmount();
    doc.destroy();
    remote.destroy();
  });

  it('协作保存后实时显示、切换标签和重载应保留相同的草稿修改', async () => {
    const doc = new Y.Doc();
    const base = { ...createState('users'), tableComment: 'base' };
    const target = { tableId: 'table-1', normalizedName: 'users' };
    const record = { ...target, name: 'Users', state: base, createdAt: 1, updatedAt: 1 };
    upsertSavedTableInYDoc(doc, record);
    const remote = new Y.Doc();
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    mockSignedInWorkspaceYDoc(doc);

    const { wrapper } = createQueryClientWrapper();
    const { result, unmount } = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const source = {
      kind: 'saved_table' as const,
      ...target,
      tableName: 'Users',
      baseSignature: '',
    };
    const loaded = result.current.resolveWorkspaceSnapshot(source);
    if (!loaded) throw new Error('Saved table snapshot missing');
    act(() => result.current.selectWorkspaceSnapshot(loaded.source, loaded.state));
    act(() =>
      upsertSavedDraftInYDoc(doc, target, {
        state: { ...base, tableComment: 'local draft' },
        tableName: 'Users',
        baseSignature: (loaded.source as typeof source).baseSignature,
        updatedAt: 2,
      }),
    );
    await waitFor(() => expect(result.current.persistedState?.tableComment).toBe('local draft'));

    upsertSavedTableInYDoc(remote, {
      ...record,
      state: { ...base, tableComment: 'remote save', schemaName: 'remote_schema' },
      updatedAt: 3,
    });
    act(() => Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote)));
    const reopened = result.current.resolveWorkspaceSnapshot(result.current.activeSource);
    if (!reopened) throw new Error('Saved table snapshot missing');
    expect(reopened.state).toMatchObject({
      tableComment: 'local draft',
      schemaName: 'remote_schema',
    });
    expect(result.current.persistedState).toEqual(reopened.state);
    expect(result.current.activeSource).toEqual(reopened.source);
    act(() => result.current.selectWorkspaceSnapshot(reopened.source, reopened.state));
    expect(result.current.persistedState).toEqual(reopened.state);
    unmount();

    const reloaded = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => expect(reloaded.result.current.hydrated).toBe(true));
    expect(reloaded.result.current.persistedState).toEqual(reopened.state);
    expect(reloaded.result.current.resolveWorkspaceSnapshot(source)?.state).toEqual(reopened.state);
    reloaded.unmount();
    doc.destroy();
    remote.destroy();
  });

  beforeEach(() => {
    setupFakeIndexedDB();
    localStorageMock.clear();
    vi.clearAllMocks();
    vi.mocked(useAuthIdentity).mockReturnValue(signedOutIdentity);
    vi.mocked(useWorkspaceYDocDocument).mockReturnValue({
      doc: null,
      synced: false,
      localSynced: true,
      connectionState: 'idle',
      retry: vi.fn(),
    } as any);
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('恢复本地 ID 草稿后删除应同时清理缓存', async () => {
    const target = { tableId: 'table-users', normalizedName: 'users' };
    await addSavedTable({
      ...target,
      name: 'Users',
      state: createState('users'),
      createdAt: 1,
      updatedAt: 1,
    });
    await writeSavedDraftInScope(
      'users',
      {
        tableId: target.tableId,
        tableName: 'Users',
        state: createState('dirty'),
        baseSignature: 'base',
        updatedAt: 2,
      },
      anonymousScope,
    );
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.getSavedTableDraft(target)?.state.tableName).toBe('dirty');
    await act(async () => result.current.removeSavedTableDraft(target));
    await waitFor(async () => expect(await readSavedDraft('users')).toBeNull());
    expect(result.current.getSavedTableDraft(target)).toBeNull();
  });

  it('同名表按 ID 独立缓存草稿，旧名称会话回退到草稿箱', async () => {
    const doc = new Y.Doc();
    const scope = { kind: 'user', userId: 'user-1', workspaceId: 'ws-1' } as const;
    const targets = ['first', 'second'].map((tableId) => ({ tableId, normalizedName: 'shared' }));
    for (const target of targets) {
      upsertSavedTableInYDoc(doc, {
        ...target,
        name: 'Shared',
        state: createState(target.tableId),
        createdAt: 1,
        updatedAt: 1,
      });
      upsertSavedDraftInYDoc(doc, target, {
        state: createState(`${target.tableId}-draft`),
        tableName: 'Shared',
        baseSignature: 'base',
        updatedAt: 2,
      });
    }
    upsertDraftInYDoc(doc, 'default', { state: createState('fallback'), updatedAt: 1 });
    await writeWorkspaceSession(
      { activeSource: { kind: 'saved_table', normalizedName: 'shared' }, updatedAt: 1 },
      scope,
    );
    mockSignedInWorkspaceYDoc(doc);
    const { wrapper } = createQueryClientWrapper();
    const { result, unmount } = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.persistedState?.tableName).toBe('fallback');
    expect(result.current.getSavedTableDraft(targets[0])?.state.tableName).toBe('first-draft');
    expect(result.current.getSavedTableDraft(targets[1])?.state.tableName).toBe('second-draft');
    await act(async () => result.current.removeSavedTableDraft(targets[0]));
    await waitFor(() => expect(getSavedDraftFromYDoc(doc, targets[0])).toBeNull());
    expect(result.current.getSavedTableDraft(targets[1])?.state.tableName).toBe('second-draft');
    unmount();
    doc.destroy();
  });

  it('应迁移 localStorage 全局草稿到 IndexedDB 并恢复', async () => {
    const draftState = createState('global_from_legacy');
    localStorageMock.setItem(
      GLOBAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ state: draftState, updatedAt: Date.now() }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toEqual(draftState);
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
    });

    const dbDraft = await readDraft(DEFAULT_DRAFT_ID);
    expect(dbDraft?.state.tableName).toBe('global_from_legacy');
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(GLOBAL_DRAFT_STORAGE_KEY);
  });

  it('登录用户不应自动拉取云端 workspace', async () => {
    vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toBeNull();
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('登录用户不应把匿名 scope 全局草稿当作自己的主工作区', async () => {
    await writeDraft(
      DEFAULT_DRAFT_ID,
      {
        state: createState('anonymous_local'),
        updatedAt: 999,
      },
      getAnonymousWorkspaceScope(),
    );
    vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    expect(result.current.persistedState).toBeNull();
  });

  it('登录 workspace 无会话时应恢复最新普通草稿', async () => {
    const scope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-1' };
    await writeDraft(
      'draft_old',
      { state: createState('old_draft'), createdAt: 1, updatedAt: 1 },
      scope,
    );
    await writeDraft(
      'draft_new',
      { state: createState('new_draft'), createdAt: 2, updatedAt: 2 },
      scope,
    );
    vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'draft_new' });
      expect(result.current.persistedState?.tableName).toBe('new_draft');
    });
  });

  it('登录用户编辑全局草稿后不应被重复 hydrate 回滚', async () => {
    vi.mocked(useAuthIdentity).mockReturnValue(signedInIdentity);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    const nextState = createState('editable_default draft');
    act(() => {
      result.current.setWorkspaceSnapshot({ kind: 'draft', draftId: 'default' }, nextState);
    });

    await waitFor(() => {
      expect(result.current.persistedState?.tableName).toBe('editable_default draft');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.persistedState?.tableName).toBe('editable_default draft');
  });

  it('保存全局草稿时应写入 IndexedDB 全局草稿和工作区会话', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    const payload: WorkspaceSavePayload = {
      state: createState('next_global'),
      source: { kind: 'draft', draftId: 'default' },
    };

    act(() => {
      result.current.saveState(payload);
    });

    expect(result.current.getDraftState(DEFAULT_DRAFT_ID)?.tableName).toBe('next_global');

    await waitFor(async () => {
      const dbDraft = await readDraft(DEFAULT_DRAFT_ID);
      expect(dbDraft?.state.tableName).toBe('next_global');
      const session = await readWorkspaceSession();
      expect(session?.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
    });
  });

  it('本地 YDoc 已加载时应在远端连接前写入 YDoc', async () => {
    const doc = new Y.Doc();
    mockSignedInWorkspaceYDoc(doc);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.saveState({
        state: createState('pending_remote_draft'),
        source: { kind: 'draft', draftId: 'default' },
      });
    });

    await waitFor(() => {
      expect(getDraftRecordFromYDoc(doc, 'default')?.state.tableName).toBe('pending_remote_draft');
    });
    await expect(
      readDraft('default', { kind: 'user', userId: 'user-1', workspaceId: 'ws-1' }),
    ).resolves.toBeNull();
  });

  it('编辑即时进入 YDoc，随后到达的远端无冲突修改不覆盖本地输入', async () => {
    const doc = new Y.Doc();
    const remote = new Y.Doc();
    const base = createState('users');
    upsertDraftInYDoc(doc, 'default', { state: base, updatedAt: 1 });
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    mockSignedInWorkspaceYDoc(doc);
    useEditorStore.getState().replaceDocument(base);
    const getCurrentState = () => toPersistedState(useEditorStore.getState());
    const { wrapper } = createQueryClientWrapper();
    const { result, unmount } = renderHook(
      () => {
        const persistence = useTestPersistedState();
        const editor = useEditorStore();
        const currentState = useMemo(() => toPersistedState(editor), [editor]);
        usePersistedSync({
          hydrated: persistence.hydrated,
          enabled: true,
          persistedState: persistence.persistedState,
          activeSource: persistence.activeSource,
          saveState: persistence.saveState,
          currentState,
          getCurrentState,
          applyPersistedState: editor.replaceDocument,
        });
        return persistence;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => useEditorStore.getState().setTableComment('local edit'));
    expect(getDraftRecordFromYDoc(doc, 'default')?.state.tableComment).toBe('local edit');
    await act(async () => {
      upsertDraftInYDoc(remote, 'default', {
        state: { ...base, schemaName: 'remote_schema' },
        updatedAt: 2,
      });
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote');
    });
    expect(useEditorStore.getState()).toMatchObject({
      tableComment: 'local edit',
      schemaName: 'remote_schema',
    });
    unmount();
    doc.destroy();
    remote.destroy();
    useEditorStore.getState().resetDocument();
  });

  it('accepts a remote revert after a local draft write has completed', async () => {
    const doc = new Y.Doc();
    const remote = new Y.Doc();
    const base = createState('users');
    upsertDraftInYDoc(doc, 'default', { state: base, updatedAt: 1 });
    Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
    mockSignedInWorkspaceYDoc(doc);
    useEditorStore.getState().replaceDocument(base);
    const getCurrentState = () => toPersistedState(useEditorStore.getState());
    const { wrapper } = createQueryClientWrapper();
    const { result, unmount } = renderHook(
      () => {
        const persistence = useTestPersistedState();
        const editor = useEditorStore();
        const currentState = useMemo(() => toPersistedState(editor), [editor]);
        usePersistedSync({
          hydrated: persistence.hydrated,
          enabled: true,
          persistedState: persistence.persistedState,
          activeSource: persistence.activeSource,
          saveState: persistence.saveState,
          currentState,
          getCurrentState,
          applyPersistedState: editor.replaceDocument,
        });
        return persistence;
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(async () => useEditorStore.getState().setTableComment('local edit'));
    expect(getDraftRecordFromYDoc(doc, 'default')?.state.tableComment).toBe('local edit');
    await act(async () => {
      Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
      upsertDraftInYDoc(remote, 'default', {
        state: { ...base, tableComment: '' },
        updatedAt: 2,
      });
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote), 'remote');
    });
    expect(useEditorStore.getState().tableComment).toBe('');
    expect(getDraftRecordFromYDoc(doc, 'default')?.state.tableComment).toBe('');
    unmount();
    doc.destroy();
    remote.destroy();
    useEditorStore.getState().resetDocument();
  });

  it('本地 YDoc 保存回声应保留当前编辑态入口', async () => {
    const doc = new Y.Doc();
    mockSignedInWorkspaceYDoc(doc);
    const initialState = createState('initial_from_ydoc');
    const localSavedState = createState('local_saved_echo');
    upsertDraftInYDoc(doc, 'default', { state: initialState, updatedAt: 100 });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(result.current.persistedState?.tableName).toBe('initial_from_ydoc');
    });

    act(() => {
      result.current.saveState({
        state: localSavedState,
        source: { kind: 'draft', draftId: 'default' },
      });
    });

    await waitFor(() => {
      expect(getDraftRecordFromYDoc(doc, 'default')?.state.tableName).toBe('local_saved_echo');
    });
    expect(result.current.getDraftState('default')?.tableName).toBe('local_saved_echo');
    expect(result.current.persistedState?.tableName).toBe('initial_from_ydoc');
  });

  it('YDoc 结构变更合入时应静默应用最新状态', async () => {
    const doc = new Y.Doc();
    mockSignedInWorkspaceYDoc(doc);
    const initialState = {
      ...createState('users'),
      rows: [
        {
          order: 1,
          fieldName: 'id',
          fieldType: 'bigint',
          fieldComment: '主键',
          nullable: false,
        },
      ],
      indexes: [
        {
          id: 'idx_id',
          name: 'idx_users_id',
          fields: [{ name: 'id', direction: 'ASC' as const }],
          kind: 'unique_index',
        },
      ],
      foreignKeys: [],
    };
    upsertDraftInYDoc(doc, 'default', { state: initialState, updatedAt: 100 });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.persistedState?.tableName).toBe('users');
    });

    act(() => {
      upsertDraftInYDoc(doc, 'default', {
        state: {
          ...initialState,
          rows: [{ ...initialState.rows[0], fieldType: 'uuid' }],
          indexes: [],
        },
        updatedAt: 200,
      });
    });

    await waitFor(() => {
      expect(result.current.persistedState?.rows[0]?.fieldType).toBe('uuid');
    });
    expect(result.current.persistedState?.indexes).toEqual([]);
  });

  it('保存已保存表状态时应记录来源并把未保存修改写入 saved draft', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    const savedSource: WorkspaceSavePayload['source'] = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: '{"table":"users"}',
    };

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.setWorkspaceSnapshot(savedSource, createState('users'));
      result.current.saveState({
        state: createState('users_draft'),
        source: savedSource,
      });
    });

    await waitFor(async () => {
      const session = await readWorkspaceSession();
      expect(session?.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
      expect(session?.activeState).toBeUndefined();
      expect((await readSavedDraft('users'))?.state.tableName).toBe('users_draft');
    });
  });

  it('应忽略过期 source 的保存，避免跨工作区污染', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    const savedSource: WorkspaceSavePayload['source'] = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: '{"table":"users"}',
    };
    const globalState = createState('global_current');
    const staleState = createState('leaked_global_content');

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.setWorkspaceSnapshot(savedSource, createState('users'));
      result.current.saveState({
        state: createState('users_saved'),
        source: savedSource,
      });
    });

    await waitFor(async () => {
      const session = await readWorkspaceSession();
      expect(session?.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
    });

    act(() => {
      result.current.setWorkspaceSnapshot({ kind: 'draft', draftId: 'default' }, globalState);
    });

    await waitFor(() => {
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
    });

    act(() => {
      result.current.saveState({
        state: staleState,
        source: savedSource,
      });
    });

    expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
    expect(result.current.getDraftState(DEFAULT_DRAFT_ID)?.tableName).toBe(globalState.tableName);

    await waitFor(async () => {
      const session = await readWorkspaceSession();
      expect(session?.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(session?.activeState).toBeUndefined();
    });
  });

  it('应根据 IndexedDB 会话恢复已保存表查看上下文', async () => {
    const savedState = createState('users_saved');
    await addSavedTable({
      normalizedName: 'users',
      name: 'Users',
      state: savedState,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await writeWorkspaceSession({
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: '{"table":"users"}',
      },
      activeState: null,
      updatedAt: Date.now(),
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
      expect(result.current.persistedState).toEqual(savedState);
    });
  });

  it('setWorkspaceSnapshot 切到草稿箱时应写入会话与全局草稿', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    const globalState = createState('snapshot_global');

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.setWorkspaceSnapshot({ kind: 'draft', draftId: 'default' }, globalState);
    });

    await waitFor(async () => {
      const draft = await readDraft(DEFAULT_DRAFT_ID);
      const session = await readWorkspaceSession();
      expect(draft?.state.tableName).toBe(globalState.tableName);
      expect(session?.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(session?.activeState).toBeUndefined();
    });
  });

  it('selectWorkspaceSnapshot 切到草稿标签时应只写入会话', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    const savedDraftState = createState('saved_draft_state');
    const tabSnapshot = createState('tab_snapshot_state');

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.setWorkspaceSnapshot({ kind: 'draft', draftId: 'default' }, savedDraftState);
    });

    await waitFor(async () => {
      const draft = await readDraft(DEFAULT_DRAFT_ID);
      expect(draft?.state.tableName).toBe(savedDraftState.tableName);
    });

    act(() => {
      result.current.selectWorkspaceSnapshot({ kind: 'draft', draftId: 'default' }, tabSnapshot);
    });

    await waitFor(async () => {
      const draft = await readDraft(DEFAULT_DRAFT_ID);
      const session = await readWorkspaceSession();
      expect(draft?.state.tableName).toBe(savedDraftState.tableName);
      expect(session?.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(session?.activeState).toBeUndefined();
    });
  });

  it('主工作区 clearState 在 default draft 下应清空草稿与会话', async () => {
    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    const globalState = createState('global_to_clear');

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.setWorkspaceSnapshot({ kind: 'draft', draftId: 'default' }, globalState);
    });

    await waitFor(async () => {
      const draft = await readDraft(DEFAULT_DRAFT_ID);
      const session = await readWorkspaceSession();
      expect(draft?.state.tableName).toBe(globalState.tableName);
      expect(session?.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
    });

    act(() => {
      result.current.clearState();
    });

    await waitFor(async () => {
      const draft = await readDraft(DEFAULT_DRAFT_ID);
      const session = await readWorkspaceSession();
      expect(draft).toBeNull();
      expect(session).toBeNull();
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(result.current.persistedState).toBeNull();
      expect(result.current.getDraftState(DEFAULT_DRAFT_ID)).toBeNull();
    });
  });

  it('主工作区 clearState 在 saved_table 下不应清空全局草稿', async () => {
    const existingGlobal = createState('existing_global');
    await writeDraft(DEFAULT_DRAFT_ID, { state: existingGlobal, updatedAt: Date.now() });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });
    const savedSource: WorkspaceSavePayload['source'] = {
      kind: 'saved_table',
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: '{"table":"users"}',
    };

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });

    act(() => {
      result.current.setWorkspaceSnapshot(savedSource, createState('users'));
    });

    await waitFor(() => {
      expect(result.current.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
    });

    act(() => {
      result.current.clearState();
    });

    await waitFor(async () => {
      const draft = await readDraft(DEFAULT_DRAFT_ID);
      const session = await readWorkspaceSession();
      expect(draft?.state.tableName).toBe(existingGlobal.tableName);
      expect(session).toBeNull();
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(result.current.persistedState).toBeNull();
    });
  });

  it('分享路径应加载远端状态', async () => {
    const sharedState = createState('shared_users');
    mockedGetShareState.mockResolvedValue(sharedState as any);
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toEqual(sharedState);
      expect(result.current.isShareView).toBe(true);
    });
  });

  it('分享路径 saveState 与 clearState 应写入并清理 share 本地快照', async () => {
    const sharedState = createState('shared_from_remote');
    mockedGetShareState.mockResolvedValue(sharedState as any);
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.isShareView).toBe(true);
    });

    const nextState = createState('shared_local_next');

    act(() => {
      result.current.saveState({
        state: nextState,
        source: { kind: 'draft', draftId: 'default' },
      });
    });

    expect(result.current.persistedState).toEqual(nextState);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      SHARE_STORAGE_KEY,
      JSON.stringify(nextState),
    );

    act(() => {
      result.current.clearState();
    });

    expect(result.current.persistedState).toBeNull();
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(SHARE_STORAGE_KEY);
  });

  it('分享不存在时应回跳首页并恢复主工作区', async () => {
    await writeDraft(DEFAULT_DRAFT_ID, {
      state: createState('global_after_share_fail'),
      updatedAt: Date.now(),
    });
    mockedGetShareState.mockRejectedValue(
      new ShareApiError('Share not found', 404, 'SHARE_NOT_FOUND'),
    );
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(toast).toHaveBeenCalledWith('分享链接不存在或已过期，已返回首页');
      expect(result.current.persistedState).toEqual(createState('global_after_share_fail'));
      expect(result.current.isShareView).toBe(false);
    });
  });

  it('分享失效时若 Y.Doc 还没加载完，必须回到等待而不是就地水合旧分区', async () => {
    const doc = new Y.Doc();
    mockSignedInWorkspaceYDoc(doc, false);
    await writeDraft(
      DEFAULT_DRAFT_ID,
      { state: createState('legacy_partition_draft'), updatedAt: Date.now() },
      { kind: 'user', userId: 'user-1', workspaceId: 'ws-1' },
    );
    mockedGetShareState.mockRejectedValue(
      new ShareApiError('Share not found', 404, 'SHARE_NOT_FOUND'),
    );
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result, rerender } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('分享链接不存在或已过期，已返回首页');
      expect(window.location.pathname).toBe('/');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.hydrated).toBe(false);
    expect(result.current.persistedState).toBeNull();

    upsertDraftInYDoc(doc, DEFAULT_DRAFT_ID, {
      state: createState('ydoc_draft'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    mockSignedInWorkspaceYDoc(doc, true);
    rerender();

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toMatchObject({ tableName: 'ydoc_draft' });
    });
  });

  it('非法分享路径应标记错误并回退主工作区', async () => {
    const fallbackState = createState('fallback_from_invalid_share');
    await writeDraft(DEFAULT_DRAFT_ID, { state: fallbackState, updatedAt: Date.now() });
    window.history.replaceState({}, '', '/share/not-uuid');

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(toast).toHaveBeenCalledWith('分享链接加载失败，已返回首页');
      expect(result.current.persistedState).toEqual(fallbackState);
      expect(result.current.isShareView).toBe(false);
      expect(window.location.pathname).toBe('/');
    });
  });

  it('分享路径应先使用本地缓存再被远端状态刷新', async () => {
    const cachedState = createState('cached_share_state');
    const remoteState = createState('remote_share_state');
    const deferred = createDeferred<any>();
    localStorageMock.setItem(SHARE_STORAGE_KEY, JSON.stringify(cachedState));
    mockedGetShareState.mockReturnValueOnce(deferred.promise);
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.persistedState).toEqual(cachedState);
    });

    deferred.resolve(remoteState);

    await waitFor(() => {
      expect(result.current.persistedState).toEqual(remoteState);
    });
  });

  it('离开分享路径后应忽略尚未完成的远端加载', async () => {
    const cachedState = createState('cached_share_state');
    const remoteState = createState('stale_remote_state');
    const deferred = createDeferred<any>();
    localStorageMock.setItem(SHARE_STORAGE_KEY, JSON.stringify(cachedState));
    mockedGetShareState.mockReturnValueOnce(deferred.promise);
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result, rerender } = renderHook(() => useTestPersistedState(), { wrapper });
    await waitFor(() => {
      expect(result.current.persistedState).toEqual(cachedState);
    });

    window.history.replaceState({}, '', '/');
    rerender();
    localStorageMock.setItem.mockClear();
    await act(async () => {
      deferred.resolve(remoteState);
      await deferred.promise;
      await Promise.resolve();
    });

    expect(result.current.persistedState).not.toEqual(remoteState);
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
      SHARE_STORAGE_KEY,
      JSON.stringify(remoteState),
    );
  });

  it('分享加载出现通用错误时应标记 error 并回退主工作区', async () => {
    const fallbackState = createState('global_after_share_error');
    await writeDraft(DEFAULT_DRAFT_ID, { state: fallbackState, updatedAt: Date.now() });
    mockedGetShareState.mockRejectedValue(new Error('network failed'));
    window.history.replaceState({}, '', `/share/${VALID_SHARE_ID}`);

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(toast).toHaveBeenCalledWith('分享链接加载失败，已返回首页');
      expect(result.current.persistedState).toEqual(fallbackState);
      expect(result.current.isShareView).toBe(false);
      expect(window.location.pathname).toBe('/');
    });
  });

  it('会话为 saved_table 但实体缺失时应回退到 default draft', async () => {
    const fallbackState = createState('global_fallback_when_saved_missing');
    await writeDraft(DEFAULT_DRAFT_ID, { state: fallbackState, updatedAt: Date.now() });
    await writeWorkspaceSession({
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'missing',
        tableName: 'Missing',
        baseSignature: '{"table":"missing"}',
      },
      activeState: null,
      updatedAt: Date.now(),
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(result.current.persistedState).toEqual(fallbackState);
    });
  });

  it('会话为 default draft 且存在草稿实体时应优先恢复实体状态', async () => {
    const sessionState = createState('session_active_state');
    const globalState = createState('global_backup_state');
    await writeDraft(DEFAULT_DRAFT_ID, { state: globalState, updatedAt: Date.now() });
    await writeWorkspaceSession({
      activeSource: { kind: 'draft', draftId: 'default' },
      activeState: sessionState,
      updatedAt: Date.now(),
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(result.current.persistedState).toEqual(globalState);
    });
  });

  it('会话为 default draft 且无 activeState 时应回退到 globalDraft', async () => {
    const globalState = createState('global_fallback_state');
    await writeDraft(DEFAULT_DRAFT_ID, { state: globalState, updatedAt: Date.now() });
    await writeWorkspaceSession({
      activeSource: { kind: 'draft', draftId: 'default' },
      activeState: null,
      updatedAt: Date.now(),
    });

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toEqual({ kind: 'draft', draftId: 'default' });
      expect(result.current.persistedState).toEqual(globalState);
    });
  });

  it('应迁移 localStorage 工作区会话并恢复已保存表', async () => {
    const savedState = createState('users_saved');
    await addSavedTable({
      normalizedName: 'users',
      name: 'Users',
      state: savedState,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    localStorageMock.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({
        activeSource: {
          kind: 'saved_table',
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: '{"table":"users"}',
        },
        activeState: null,
        updatedAt: Date.now(),
      }),
    );

    const { wrapper } = createQueryClientWrapper();
    const { result } = renderHook(() => useTestPersistedState(), { wrapper });

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
      expect(result.current.persistedState).toEqual(savedState);
    });

    await waitFor(async () => {
      const session = await readWorkspaceSession();
      expect(session?.activeSource).toMatchObject({
        kind: 'saved_table',
        normalizedName: 'users',
      });
    });
  });
});
