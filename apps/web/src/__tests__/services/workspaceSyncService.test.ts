import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WORKSPACE_SNAPSHOT_APPLIED_EVENT,
  exportWorkspaceToCloud,
  importWorkspaceFromCloud,
} from '@/services/workspaceSyncService';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { addSavedTable, listSavedTables } from '@/utils/savedTablesDb';
import {
  listSavedDrafts,
  readGlobalDraft,
  readWorkspaceSession,
  listDrafts,
  upsertSavedDraft,
  writeDraft,
  writeGlobalDraft,
  writeWorkspaceSession,
} from '@/utils/workspaceStateDb';
import { createFolder, listFolders } from '@/utils/tableFolders';

const createState = (tableName: string) => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql' as const,
  sqlFormatMode: 'compact' as const,
  rows: [],
  addCount: 10,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('workspaceSyncService', () => {
  const scope = { kind: 'user' as const, userId: 'user-1' };

  beforeEach(() => {
    setupFakeIndexedDB();
    vi.clearAllMocks();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('上传到云端时应发送当前 scope 的完整工作区快照', async () => {
    await writeGlobalDraft(
      {
        state: createState('local_draft'),
        updatedAt: 100,
      },
      scope,
    );
    await writeDraft(
      'draft-2',
      {
        state: createState('draft_2'),
        updatedAt: 110,
        folderId: 'folder_1',
      },
      scope,
    );
    await addSavedTable(
      {
        normalizedName: 'users',
        name: 'Users',
        state: createState('users'),
        folderId: 'folder_1',
        createdAt: 100,
        updatedAt: 120,
      },
      scope,
    );
    await upsertSavedDraft(
      'users',
      {
        tableName: 'Users',
        state: createState('users_draft'),
        updatedAt: 130,
        baseSignature: 'base-signature',
      },
      scope,
    );
    await createFolder('我的文件夹');

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await exportWorkspaceToCloud(scope);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspace/snapshot',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
      }),
    );

    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      globalDraft: {
        state: {
          tableName: 'local_draft',
        },
        updatedAt: 100,
      },
      drafts: [
        {
          draftId: 'default',
          state: {
            tableName: 'local_draft',
          },
          updatedAt: 100,
        },
        {
          draftId: 'draft-2',
          state: {
            tableName: 'draft_2',
          },
          updatedAt: 110,
          folderId: 'folder_1',
        },
      ],
      savedTables: [
        {
          normalizedName: 'users',
          name: 'Users',
          folderId: 'folder_1',
        },
      ],
      savedDrafts: [
        {
          normalizedName: 'users',
          tableName: 'Users',
          baseSignature: 'base-signature',
        },
      ],
      folders: [
        {
          name: '我的文件夹',
        },
      ],
    });
  });

  it('从云端下载时应强覆盖当前 scope 的本地工作区', async () => {
    await writeGlobalDraft(
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

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
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
              normalizedName: 'users',
              name: 'Users',
              state: createState('users'),
              updatedAt: 210,
              folderId: 'folder_1',
            },
          ],
          savedDrafts: [
            {
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
        }),
      ),
    );

    await importWorkspaceFromCloud(scope);

    const globalDraft = await readGlobalDraft(scope);
    const drafts = await listDrafts(scope);
    const savedTables = await listSavedTables(scope);
    const savedDrafts = await listSavedDrafts(scope);
    const session = await readWorkspaceSession(scope);
    const folders = await listFolders();

    expect(globalDraft?.state.tableName).toBe('cloud_draft');
    expect(drafts.map((item) => item.draftId)).toEqual(['default', 'cloud-draft']);
    expect(drafts.find((item) => item.draftId === 'cloud-draft')?.record.folderId).toBe('folder_1');
    expect(savedTables.map((item) => item.normalizedName)).toEqual(['users']);
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
