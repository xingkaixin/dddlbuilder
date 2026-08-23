import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { clearLocalWorkspaceData, fetchCurrentWorkspace } from '@/services/workspaceAccountService';
import { addSavedTable, listSavedTables } from '@/utils/savedTablesDb';
import { bulkPutFolders, listFolders } from '@/utils/tableFolders';
import { readDraft, writeDraft } from '@/utils/workspaceStateDb';

const scope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-1' };

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

describe('workspaceAccountService', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
  });

  afterEach(() => {
    teardownFakeIndexedDB();
    vi.restoreAllMocks();
  });

  it('reads the current workspace identifier', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ workspaceId: 'ws-1' })),
    );

    await expect(fetchCurrentWorkspace()).resolves.toMatchObject({ workspaceId: 'ws-1' });
  });

  it('rejects the retired workspace list response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ activeWorkspaceId: 'ws-1', workspaces: [] })),
    );

    await expect(fetchCurrentWorkspace()).rejects.toThrow('工作区响应为空');
  });

  it('clears only the selected local workspace partition', async () => {
    const otherScope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-2' };
    await writeDraft('draft-1', { state: createState('local'), updatedAt: 1 }, scope);
    await writeDraft('draft-1', { state: createState('other'), updatedAt: 1 }, otherScope);
    await addSavedTable(
      {
        normalizedName: 'users',
        name: 'users',
        state: createState('users'),
        createdAt: 1,
        updatedAt: 1,
      },
      scope,
    );
    await bulkPutFolders([{ id: 'folder-1', name: 'Folder', order: 1, createdAt: 1 }], scope);

    await clearLocalWorkspaceData(scope);

    expect(await readDraft('draft-1', scope)).toBeNull();
    expect((await readDraft('draft-1', otherScope))?.state.tableName).toBe('other');
    expect(await listSavedTables(scope)).toEqual([]);
    expect(await listFolders(scope)).toEqual([]);
  });
});
