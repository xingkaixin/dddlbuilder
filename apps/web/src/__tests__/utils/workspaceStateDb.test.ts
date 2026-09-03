import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_KEY } from '@/utils/constants';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceScope, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import {
  addSavedTable as addSavedTableInScope,
  type SavedTableRecord,
} from '@/utils/savedTablesDb';
import {
  DEFAULT_DRAFT_ID,
  clearWorkspaceSession as clearWorkspaceSessionInScope,
  deleteDraft as deleteDraftInScope,
  deleteSavedDraft as deleteSavedDraftInScope,
  listSavedDrafts as listSavedDraftsInScope,
  migrateLegacyWorkspaceFromLocalStorage,
  readDraft as readDraftInScope,
  readSavedDraft as readSavedDraftInScope,
  readWorkspaceBootstrap as readWorkspaceBootstrapInScope,
  readWorkspaceSession as readWorkspaceSessionInScope,
  renameSavedDraftKey as renameSavedDraftKeyInScope,
  upsertSavedDraft as upsertSavedDraftInScope,
  writeDraft as writeDraftInScope,
  writeWorkspaceSession as writeWorkspaceSessionInScope,
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

const addSavedTable = (record: Parameters<typeof addSavedTableInScope>[0]) =>
  addSavedTableInScope(record, anonymousScope);
const clearWorkspaceSession = () => clearWorkspaceSessionInScope(anonymousScope);
const deleteDraft = (draftId: Parameters<typeof deleteDraftInScope>[0]) =>
  deleteDraftInScope(draftId, anonymousScope);
const deleteSavedDraft = (normalizedName: Parameters<typeof deleteSavedDraftInScope>[0]) =>
  deleteSavedDraftInScope(normalizedName, anonymousScope);
const listSavedDrafts = () => listSavedDraftsInScope(anonymousScope);
const readDraft = (draftId: Parameters<typeof readDraftInScope>[0], scope = anonymousScope) =>
  readDraftInScope(draftId, scope);
const readSavedDraft = (
  normalizedName: Parameters<typeof readSavedDraftInScope>[0],
  scope = anonymousScope,
) => readSavedDraftInScope(normalizedName, scope);
const readWorkspaceBootstrap = () => readWorkspaceBootstrapInScope(anonymousScope);
const readWorkspaceSession = () => readWorkspaceSessionInScope(anonymousScope);
const renameSavedDraftKey = (
  fromNormalizedName: Parameters<typeof renameSavedDraftKeyInScope>[0],
  toNormalizedName: Parameters<typeof renameSavedDraftKeyInScope>[1],
  nextTableName: Parameters<typeof renameSavedDraftKeyInScope>[2],
) =>
  renameSavedDraftKeyInScope(fromNormalizedName, toNormalizedName, nextTableName, anonymousScope);
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
const writeWorkspaceSession = (record: Parameters<typeof writeWorkspaceSessionInScope>[0]) =>
  writeWorkspaceSessionInScope(record, anonymousScope);

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

  it('全局草稿应支持读写清理', async () => {
    expect(await readDraft(DEFAULT_DRAFT_ID)).toBeNull();

    await writeDraft(DEFAULT_DRAFT_ID, { state: createState('global'), updatedAt: 100 });
    expect(await readDraft(DEFAULT_DRAFT_ID)).toEqual({
      state: createState('global'),
      createdAt: 100,
      updatedAt: 100,
    });

    await deleteDraft(DEFAULT_DRAFT_ID);
    expect(await readDraft(DEFAULT_DRAFT_ID)).toBeNull();
  });

  it('已保存草稿应支持 CRUD 与重命名', async () => {
    await upsertSavedDraft('users', {
      state: createState('users_draft'),
      tableName: 'Users',
      baseSignature: 'sig_users',
      updatedAt: 11,
    });

    expect(await readSavedDraft('users')).toMatchObject({
      tableName: 'Users',
      baseSignature: 'sig_users',
    });

    expect(await listSavedDrafts()).toMatchObject({
      users: {
        tableName: 'Users',
        baseSignature: 'sig_users',
      },
    });

    await renameSavedDraftKey('users', 'customers', 'Customers');
    expect(await readSavedDraft('users')).toBeNull();
    expect(await readSavedDraft('customers')).toMatchObject({
      tableName: 'Customers',
      baseSignature: 'sig_users',
    });

    await renameSavedDraftKey('customers', 'customers', 'Customers_2');
    expect(await readSavedDraft('customers')).toMatchObject({
      tableName: 'Customers_2',
    });

    await deleteSavedDraft('customers');
    expect(await readSavedDraft('customers')).toBeNull();
  });

  it('工作区会话应支持读写清理', async () => {
    expect(await readWorkspaceSession()).toBeNull();

    await writeWorkspaceSession({
      activeSource: { kind: 'draft', draftId: 'default' },
      updatedAt: 22,
    });

    expect(await readWorkspaceSession()).toEqual({
      activeSource: { kind: 'draft', draftId: 'default' },
      updatedAt: 22,
    });

    await clearWorkspaceSession();
    expect(await readWorkspaceSession()).toBeNull();
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

  it('readWorkspaceBootstrap 在 activeSource 为 saved_table 时应联动读取主表', async () => {
    const savedRecord: SavedTableRecord = {
      normalizedName: 'users',
      name: 'Users',
      state: createState('users_from_saved'),
      createdAt: 1,
      updatedAt: 2,
    };
    await addSavedTable(savedRecord);

    await writeWorkspaceSession({
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
      },
      updatedAt: 33,
    });

    const bootstrap = await readWorkspaceBootstrap();

    expect(bootstrap.session?.activeSource).toMatchObject({
      kind: 'saved_table',
      normalizedName: 'users',
    });
    expect(bootstrap.savedTable).toMatchObject({
      normalizedName: 'users',
      name: 'Users',
    });
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

  it('应兼容旧版全局草稿键 STORAGE_KEY', async () => {
    localStorageMock.setItem(STORAGE_KEY, JSON.stringify(createState('legacy_v0')));

    await migrateLegacyWorkspaceFromLocalStorage();

    expect(await readDraft(DEFAULT_DRAFT_ID)).toMatchObject({
      state: createState('legacy_v0'),
    });
  });

  it('legacy 非法结构应忽略且不触发清理', async () => {
    localStorageMock.setItem(
      SAVED_TABLE_DRAFTS_STORAGE_KEY,
      JSON.stringify({
        users: { tableName: 123, baseSignature: null },
      }),
    );

    await migrateLegacyWorkspaceFromLocalStorage();

    expect(await readDraft(DEFAULT_DRAFT_ID)).toBeNull();
    expect(await readWorkspaceSession()).toBeNull();
    expect(await listSavedDrafts()).toEqual({});
    expect(localStorageMock.removeItem).not.toHaveBeenCalled();
  });

  it('迁移失败时不应删除 legacy 数据', async () => {
    localStorageMock.setItem(
      GLOBAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ state: createState('legacy_keep'), updatedAt: 1 }),
    );

    const originalIndexedDB = (globalThis as any).indexedDB;
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

  it('并发迁移应复用同一任务，避免重复清理', async () => {
    localStorageMock.setItem(
      GLOBAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ state: createState('legacy_once'), updatedAt: 1 }),
    );

    await Promise.all([
      migrateLegacyWorkspaceFromLocalStorage(),
      migrateLegacyWorkspaceFromLocalStorage(),
    ]);

    const globalDraftRemoveCalls = localStorageMock.removeItem.mock.calls.filter(
      ([key]) => key === GLOBAL_DRAFT_STORAGE_KEY,
    );
    expect(globalDraftRemoveCalls).toHaveLength(1);
    expect(await readDraft(DEFAULT_DRAFT_ID)).toMatchObject({
      state: createState('legacy_once'),
    });
  });
});
