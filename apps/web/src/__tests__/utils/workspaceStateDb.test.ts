import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '@/utils/constants';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceScope, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import {
  DEFAULT_DRAFT_ID,
  listSavedDrafts as listSavedDraftsInScope,
  migrateLegacyWorkspaceFromLocalStorage,
  readDraft as readDraftInScope,
  readSavedDraft as readSavedDraftInScope,
  readWorkspaceSession as readWorkspaceSessionInScope,
  upsertSavedDraft as upsertSavedDraftInScope,
  writeDraft as writeDraftInScope,
} from '@/utils/workspaceStateDb';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { runIndexedDbRequest } from '@/utils/indexedDbTransaction';
import { openDb, WORKSPACE_SESSION_STORE_NAME } from '@/utils/workspaceDb';
import {
  buildScopedWorkspaceKey,
  getAnonymousWorkspaceScope,
  getWorkspaceScopeStorageKey,
} from '@/utils/workspaceScope';

const GLOBAL_DRAFT_STORAGE_KEY = `${STORAGE_KEY}:draft:global:v1`;
const SAVED_TABLE_DRAFTS_STORAGE_KEY = `${STORAGE_KEY}:draft:saved:v1`;
const WORKSPACE_SESSION_STORAGE_KEY = `${STORAGE_KEY}:workspace:v1`;
const anonymousScope = getAnonymousWorkspaceScope();

const listSavedDrafts = () => listSavedDraftsInScope(anonymousScope);
const readDraft = (draftId: Parameters<typeof readDraftInScope>[0], scope = anonymousScope) =>
  readDraftInScope(draftId, scope);
const readSavedDraft = (
  normalizedName: Parameters<typeof readSavedDraftInScope>[0],
  scope = anonymousScope,
) => readSavedDraftInScope(normalizedName, scope);
const readWorkspaceSession = () => readWorkspaceSessionInScope(anonymousScope);
const upsertSavedDraft = (
  normalizedName: Parameters<typeof upsertSavedDraftInScope>[0],
  record: Parameters<typeof upsertSavedDraftInScope>[1],
  scope = anonymousScope,
) => upsertSavedDraftInScope(normalizedName, record, scope);
const writeDraft = (
  draftId: Parameters<typeof writeDraftInScope>[0],
  record: Parameters<typeof writeDraftInScope>[1],
  scope = anonymousScope,
) => writeDraftInScope(draftId, record, scope);

const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
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

const createState = (tableName = 'users'): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
});

const writeLegacyWorkspaceSession = async (
  record: {
    activeSource: WorkspaceSource;
    activeState: unknown;
    updatedAt: number;
  },
  scope: WorkspaceScope = anonymousScope,
) => {
  const db = await openDb();
  await runIndexedDbRequest(db, WORKSPACE_SESSION_STORE_NAME, 'readwrite', (store) =>
    store.put({
      id: buildScopedWorkspaceKey(scope, 'active'),
      scope: getWorkspaceScopeStorageKey(scope),
      ...record,
    }),
  );
};

describe('workspaceStateDb', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('旧工作区会话的 activeState 读取时应归一化历史枚举值', async () => {
    const legacyRow = {
      id: 'field-id',
      order: 1,
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '主键',
      nullable: '否',
      defaultKind: '自增',
      defaultValue: '',
      onUpdate: '当前时间',
    };
    const expectedRow = {
      id: 'field-id',
      fieldName: 'id',
      fieldType: 'bigint',
      fieldComment: '主键',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'current_timestamp',
    };

    await writeLegacyWorkspaceSession({
      activeSource: { kind: 'draft', draftId: 'default' },
      activeState: {
        ...createState('active'),
        rows: [legacyRow],
      },
      updatedAt: 44,
    });

    expect((await readWorkspaceSession())?.activeState?.rows).toEqual([expectedRow]);
  });

  it('workspace 数据应按账号 scope 隔离', async () => {
    const anonymousScope = getAnonymousWorkspaceScope();
    const userAScope = { kind: 'legacy_user' as const, userId: 'user-a' };
    const userBScope = { kind: 'legacy_user' as const, userId: 'user-b' };

    await writeDraft(
      DEFAULT_DRAFT_ID,
      { state: createState('anon'), updatedAt: 1 },
      anonymousScope,
    );
    await writeDraft(DEFAULT_DRAFT_ID, { state: createState('userA'), updatedAt: 2 }, userAScope);
    await upsertSavedDraft(
      'users',
      {
        state: createState('draftA'),
        tableName: 'Users',
        baseSignature: 'sig-a',
        updatedAt: 3,
      },
      userAScope,
    );

    expect((await readDraft(DEFAULT_DRAFT_ID, anonymousScope))?.state.tableName).toBe('anon');
    expect((await readDraft(DEFAULT_DRAFT_ID, userAScope))?.state.tableName).toBe('userA');
    expect(await readDraft(DEFAULT_DRAFT_ID, userBScope)).toBeNull();
    expect(await readSavedDraft('users', userAScope)).toMatchObject({
      tableName: 'Users',
      baseSignature: 'sig-a',
    });
    expect(await readSavedDraft('users', userBScope)).toBeNull();
  });
  it('应迁移 legacy 数据并清理 localStorage 键', async () => {
    localStorageMock.setItem(
      GLOBAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ state: createState('global_legacy'), updatedAt: 101 }),
    );
    localStorageMock.setItem(
      SAVED_TABLE_DRAFTS_STORAGE_KEY,
      JSON.stringify({
        users: {
          state: createState('users_legacy'),
          tableName: 'Users',
          baseSignature: 'sig_u',
          updatedAt: 102,
        },
      }),
    );
    localStorageMock.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify({
        activeSource: { kind: 'draft', draftId: 'default' },
        activeState: createState('session_legacy'),
        updatedAt: 103,
      }),
    );

    await migrateLegacyWorkspaceFromLocalStorage();

    expect(await readDraft(DEFAULT_DRAFT_ID)).toMatchObject({
      state: createState('global_legacy'),
      updatedAt: 101,
    });
    expect(await listSavedDrafts()).toMatchObject({
      users: {
        tableName: 'Users',
        baseSignature: 'sig_u',
      },
    });
    expect(await readWorkspaceSession()).toMatchObject({
      activeSource: { kind: 'draft', draftId: 'default' },
      activeState: createState('session_legacy'),
      updatedAt: 103,
    });

    expect(localStorageMock.removeItem).toHaveBeenCalledWith(GLOBAL_DRAFT_STORAGE_KEY);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(SAVED_TABLE_DRAFTS_STORAGE_KEY);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(WORKSPACE_SESSION_STORAGE_KEY);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });
  it('迁移失败时不应删除 legacy 数据', async () => {
    localStorageMock.setItem(
      GLOBAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ state: createState('legacy_keep'), updatedAt: 1 }),
    );

    const originalIndexedDB = globalThis.indexedDB;
    Object.defineProperty(globalThis, 'indexedDB', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    await migrateLegacyWorkspaceFromLocalStorage();

    Object.defineProperty(globalThis, 'indexedDB', {
      value: originalIndexedDB,
      configurable: true,
      writable: true,
    });

    expect(localStorageMock.getItem(GLOBAL_DRAFT_STORAGE_KEY)).not.toBeNull();
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });
});
