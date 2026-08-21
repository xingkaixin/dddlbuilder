import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listFolders,
  listChildFolders,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  bulkPutFolders,
  clearFolders,
  getDescendantFolderIds,
  getFolder,
  buildFolderTree,
  getFolderPath,
} from '@/utils/tableFolders';
import * as dbUtils from '@/utils/savedTablesDb';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from '@/__tests__/utils/fakeIndexedDb';

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

  it('should create folders and list by parent', async () => {
    const rootA = await createFolder('A');
    await createFolder('B');
    await createFolder('A1', rootA.id);
    await createFolder('A2', rootA.id);

    const roots = await listChildFolders();
    expect(roots.map((f) => f.name)).toEqual(['A', 'B']);

    const children = await listChildFolders(rootA.id);
    expect(children.map((f) => f.name)).toEqual(['A1', 'A2']);

    const all = await listFolders();
    expect(all).toHaveLength(4);
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

  it('should build tree and get path', async () => {
    const root = await createFolder('Root');
    const child = await createFolder('Child', root.id);
    const grand = await createFolder('Grand', child.id);

    const tree = await buildFolderTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].children[0].children[0].id).toBe(grand.id);

    const path = await getFolderPath(grand.id);
    expect(path.map((f) => f.name)).toEqual(['Root', 'Child', 'Grand']);
  });

  it('should return empty path for missing folder id', async () => {
    const path = await getFolderPath('missing-folder');
    expect(path).toEqual([]);
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

  it('should delete folder and descendants', async () => {
    const root = await createFolder('Root');
    const child = await createFolder('Child', root.id);
    const grand = await createFolder('Grand', child.id);

    const descendants = await getDescendantFolderIds(root.id);
    expect(new Set(descendants)).toEqual(new Set([child.id, grand.id]));

    await deleteFolder(root.id);
    const list = await listFolders();
    expect(list).toHaveLength(0);

    const missing = await getFolder(child.id);
    expect(missing).toBeNull();
  });

  it('should throw when folder not found', async () => {
    await expect(renameFolder('missing', 'x')).rejects.toThrow('文件夹不存在');
    await expect(moveFolder('missing', undefined)).rejects.toThrow('文件夹不存在');
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
