import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listFolders as listFoldersInScope,
  createFolder as createFolderInScope,
  renameFolder as renameFolderInScope,
  moveFolder as moveFolderInScope,
  deleteFolder as deleteFolderInScope,
  bulkPutFolders,
  clearFolders,
  getFolder as getFolderInScope,
  buildFolderTree as buildFolderTreeInScope,
} from '@/utils/tableFolders';
import * as dbUtils from '@/utils/workspaceDb';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';
import { getAnonymousWorkspaceScope } from '@/utils/workspaceScope';
import { addSavedTable, listTrashedSavedTables } from '@/utils/savedTablesDb';
import type { PersistedState } from '@ddlbuilder/shared-types';

const anonymousScope = getAnonymousWorkspaceScope();
const listFolders = (scope = anonymousScope) => listFoldersInScope(scope);
const createFolder = (name: string, parentId?: string) =>
  createFolderInScope(name, anonymousScope, parentId);
const renameFolder = (id: string, newName: string) =>
  renameFolderInScope(id, newName, anonymousScope);
const moveFolder = (id: string, newParentId?: string) =>
  moveFolderInScope(id, anonymousScope, newParentId);
const deleteFolder = (id: string) => deleteFolderInScope(id, anonymousScope);
const getFolder = (id: string) => getFolderInScope(id, anonymousScope);
const buildFolderTree = () => buildFolderTreeInScope(anonymousScope);
const createState = (): PersistedState => ({
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

describe('tableFolders', () => {
  beforeEach(() => {
    setupFakeIndexedDB();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    teardownFakeIndexedDB();
  });

  

  it('should rename and move folder with validations', async () => {
    const root = await createFolder('Root');
    const child = await createFolder('Child', root.id);

    await renameFolder(child.id, ' Child Renamed ');
    const renamed = await getFolder(child.id);
    expect(renamed?.name).toBe('Child Renamed');

    await expect(moveFolder(root.id, child.id)).rejects.toThrow(
      '不能将文件夹移动到自身或其子文件夹下',
    );

    const otherRoot = await createFolder('Other');
    await moveFolder(child.id, otherRoot.id);
    const moved = await getFolder(child.id);
    expect(moved?.parentId).toBe(otherRoot.id);
  });

  

  

  it('should treat missing-parent folder as root in tree', async () => {
    const orphan = await createFolder('Orphan', 'missing-parent-id');
    const tree = await buildFolderTree();

    expect(tree.map((node) => node.id)).toContain(orphan.id);
  });

  it('should move folder back to root when parent is undefined', async () => {
    const root = await createFolder('Root');
    const child = await createFolder('Child', root.id);

    await moveFolder(child.id, undefined);
    const moved = await getFolder(child.id);

    expect(moved?.parentId).toBeUndefined();
  });

  

  it('should move contained tables to trash in the same transaction', async () => {
    const root = await createFolder('Root');
    const child = await createFolder('Child', root.id);
    await addSavedTable(
      {
        normalizedName: 'users',
        name: 'Users',
        state: createState(),
        folderId: child.id,
        createdAt: 1,
        updatedAt: 1,
      },
      anonymousScope,
    );

    const affectedIds = await deleteFolder(root.id);

    expect(new Set(affectedIds)).toEqual(new Set([root.id, child.id]));
    expect((await listTrashedSavedTables(anonymousScope))[0]).toMatchObject({
      normalizedName: 'users',
      folderId: child.id,
      trashedAt: expect.any(Number),
    });
  });

  it('should throw when folder not found', async () => {
    await expect(renameFolder('missing', 'x')).rejects.toThrow('文件夹不存在');
    await expect(moveFolder('missing', undefined)).rejects.toThrow('文件夹不存在');
  });

  it('deletes only the selected visible root when stored folders form a cycle', async () => {
    await bulkPutFolders(
      [
        { id: 'a', name: 'A', parentId: 'b', order: 1, createdAt: 1 },
        { id: 'b', name: 'B', parentId: 'a', order: 2, createdAt: 1 },
      ],
      anonymousScope,
    );
    for (const id of ['a', 'b']) {
      await addSavedTable(
        {
          normalizedName: `table_${id}`,
          name: `table_${id}`,
          state: { ...createState(), tableName: `table_${id}` },
          folderId: id,
          createdAt: 1,
          updatedAt: 1,
        },
        anonymousScope,
      );
    }

    expect((await buildFolderTree()).map((folder) => folder.id)).toEqual(['a', 'b']);
    expect(await deleteFolder('a')).toEqual(['a']);
    expect((await listFolders()).map((folder) => folder.id)).toEqual(['b']);
    expect((await listTrashedSavedTables(anonymousScope)).map((table) => table.name)).toEqual([
      'table_a',
    ]);
  });

  it('should isolate folders by workspace scope', async () => {
    const workspaceA = { kind: 'user' as const, userId: 'u1', workspaceId: 'ws-a' };
    const workspaceB = { kind: 'user' as const, userId: 'u1', workspaceId: 'ws-b' };

    await bulkPutFolders([{ id: 'folder-1', name: 'A', order: 1, createdAt: 1 }], workspaceA);
    await bulkPutFolders([{ id: 'folder-1', name: 'B', order: 1, createdAt: 1 }], workspaceB);

    expect((await listFolders(workspaceA)).map((item) => item.name)).toEqual(['A']);
    expect((await listFolders(workspaceB)).map((item) => item.name)).toEqual(['B']);

    await clearFolders(workspaceA);

    expect(await listFolders(workspaceA)).toEqual([]);
    expect((await listFolders(workspaceB)).map((item) => item.name)).toEqual(['B']);
  });

  it('should handle request.onerror and tx.onabort in runWithFolderStore', async () => {
    let mockTx: any;
    let mockRequest: any;

    const mockDb = {
      transaction: () => mockTx,
      close: vi.fn(),
    };

    vi.spyOn(dbUtils, 'openDb').mockResolvedValue(mockDb as unknown as IDBDatabase);

    // 1. request.onerror fallback
    mockRequest = { onerror: null, onsuccess: null, error: null };
    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
    };

    const p1 = listFolders();
    await Promise.resolve(); // yield to let openDb resolve
    mockRequest.onerror();
    await expect(p1).rejects.toThrow('IndexedDB 请求失败');

    // 2. tx.onabort fallback
    mockRequest = { onerror: null, onsuccess: null, result: [] };
    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
      error: null,
    };

    const p2 = listFolders();
    await Promise.resolve();
    mockTx.onabort();
    await expect(p2).rejects.toThrow('事务被中止');

    // 3. tx.onerror explicit
    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
      error: new Error('tx error'),
    };
    const p3 = listFolders();
    await Promise.resolve();
    mockTx.onerror();
    await expect(p3).rejects.toThrow('tx error');

    vi.restoreAllMocks();
  });

  it('should handle non-array records returned by indexeddb in list functions', async () => {
    let mockTx: any;
    const mockRequest: any = {
      onerror: null,
      onsuccess: null,
      result: { notArray: true },
    };

    const mockDb = {
      transaction: () => mockTx,
      close: vi.fn(),
    };

    vi.spyOn(dbUtils, 'openDb').mockResolvedValue(mockDb as unknown as IDBDatabase);

    mockTx = {
      objectStore: () => ({ getAll: () => mockRequest }),
      onerror: null,
      onabort: null,
      oncomplete: null,
    };

    const p1 = listFolders();
    await Promise.resolve();
    mockRequest.onsuccess();
    mockTx.oncomplete();
    expect(await p1).toEqual([]);

    vi.restoreAllMocks();
  });
});
