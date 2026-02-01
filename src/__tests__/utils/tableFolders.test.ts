import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  listFolders,
  listChildFolders,
  createFolder,
  renameFolder,
  moveFolder,
  deleteFolder,
  getDescendantFolderIds,
  getFolder,
  buildFolderTree,
  getFolderPath,
} from '@/utils/tableFolders';
import {
  setupFakeIndexedDB,
  teardownFakeIndexedDB,
} from '@/__tests__/utils/fakeIndexedDb';

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
    await expect(moveFolder('missing', undefined)).rejects.toThrow(
      '文件夹不存在',
    );
  });
});
