import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORKSPACE_SNAPSHOT_APPLIED_EVENT,
  applyCloudSnapshotToLocal,
} from '@/services/workspaceSyncService';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { addSavedTable, listSavedTables } from '@/utils/savedTablesDb';
import {
  DEFAULT_DRAFT_ID,
  listSavedDrafts,
  readDraft,
  readWorkspaceSession,
  listDrafts,
  upsertSavedDraft,
  writeDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { listFolders } from '@/utils/tableFolders';

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

describe('workspaceSyncService', () => {
  const scope = {
    kind: 'user' as const,
    userId: 'user-1',
    workspaceId: 'workspace-1',
  };

  beforeEach(() => {
    setupFakeIndexedDB();
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('应用迁移快照时应强覆盖当前 scope 的本地工作区', async () => {
    await writeDraft(
      DEFAULT_DRAFT_ID,
      {
        state: createState('old_local'),
        updatedAt: 10,
      },
      scope,
    );
    await addSavedTable(
      {
        normalizedName: 'legacy',
        name: 'Legacy',
        state: createState('legacy'),
        createdAt: 10,
        updatedAt: 10,
      },
      scope,
    );
    await upsertSavedDraft(
      'legacy',
      {
        tableName: 'Legacy',
        state: createState('legacy_draft'),
        updatedAt: 10,
        baseSignature: 'legacy-signature',
      },
      scope,
    );
    await writeWorkspaceSession(
      {
        activeSource: { kind: 'draft', draftId: 'default' },
        activeState: createState('session_state'),
        updatedAt: 10,
      },
      scope,
    );

    const eventListener = vi.fn();
    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, eventListener);

    await applyCloudSnapshotToLocal(
      {
        globalDraft: {
          state: createState('cloud_draft'),
          updatedAt: 200,
        },
        drafts: [
          {
            draftId: 'cloud-draft',
            state: createState('cloud_draft_2'),
            updatedAt: 205,
            folderId: 'folder_1',
          },
        ],
        savedTables: [
          {
            tableId: 'table-users',
            normalizedName: 'users',
            name: 'Users',
            state: createState('users'),
            updatedAt: 210,
            folderId: 'folder_1',
          },
        ],
        savedDrafts: [
          {
            tableId: 'table-users',
            normalizedName: 'users',
            tableName: 'Users',
            state: createState('users_draft'),
            updatedAt: 220,
            baseSignature: 'cloud-signature',
          },
        ],
        folders: [
          {
            id: 'folder_1',
            name: '云端文件夹',
            order: 1,
            createdAt: 230,
          },
        ],
      },
      { overwrite: true, scope },
    );

    const globalDraft = await readDraft(DEFAULT_DRAFT_ID, scope);
    const drafts = await listDrafts(scope);
    const savedTables = await listSavedTables(scope);
    const savedDrafts = await listSavedDrafts(scope);
    const session = await readWorkspaceSession(scope);
    const folders = await listFolders(scope);

    expect(globalDraft?.state.tableName).toBe('cloud_draft');
    expect(drafts.map((item) => item.draftId)).toEqual(['default', 'cloud-draft']);
    expect(drafts.find((item) => item.draftId === 'cloud-draft')?.record.folderId).toBe('folder_1');
    expect(savedTables.map((item) => item.normalizedName)).toEqual(['users']);
    expect(savedTables[0]?.tableId).toBe('table-users');
    expect(savedDrafts.users?.tableId).toBe('table-users');
    expect(savedTables[0]?.folderId).toBe('folder_1');
    expect(Object.keys(savedDrafts)).toEqual(['users']);
    expect(savedDrafts.users?.baseSignature).toBe('cloud-signature');
    expect(session).toBeNull();
    expect(folders).toHaveLength(1);
    expect(folders[0]).toMatchObject({ id: 'folder_1', name: '云端文件夹' });

    window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, eventListener);
    expect(eventListener).toHaveBeenCalledTimes(1);
  });
});
