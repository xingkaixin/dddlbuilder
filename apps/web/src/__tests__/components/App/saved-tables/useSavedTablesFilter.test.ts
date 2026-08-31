import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSavedTablesFilter } from '@/components/App/saved-tables/useSavedTablesFilter';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { buildFolderTreeModel } from '@/utils/folderModel';

const folders = buildFolderTreeModel([
  { id: 'folder-1', name: 'Folder', order: 1, createdAt: 1, updatedAt: 1 },
]);

const table = (name: string, folderId?: string): SavedTableSummary => ({
  tableId: name.toLowerCase(),
  normalizedName: name.toLowerCase(),
  name,
  dbType: 'mysql',
  fieldCount: 1,
  createdAt: 1,
  updatedAt: 1,
  folderId,
});

describe('useSavedTablesFilter', () => {
  it('一次过滤后按文件夹建立有序索引', () => {
    const items = [table('First', 'folder-1'), table('Root'), table('Second', 'folder-1')];
    const { result } = renderHook(() => useSavedTablesFilter({ items, folders, searchQuery: '' }));

    expect(result.current.itemsByFolder.get('folder-1')?.map((item) => item.name)).toEqual([
      'First',
      'Second',
    ]);
    expect(result.current.ungroupedItems.map((item) => item.name)).toEqual(['Root']);
  });

  it('索引只包含搜索命中的表', () => {
    const items = [table('Users', 'folder-1'), table('Orders', 'folder-1')];
    const { result } = renderHook(() =>
      useSavedTablesFilter({ items, folders, searchQuery: 'user' }),
    );

    expect(result.current.filteredItems.map((item) => item.name)).toEqual(['Users']);
    expect(result.current.itemsByFolder.get('folder-1')?.map((item) => item.name)).toEqual([
      'Users',
    ]);
  });

  it('keeps missing-folder items visible at root when folders change', () => {
    const items = [table('Restored draft', 'removed'), table('Kept', 'folder-1')];
    const { result, rerender } = renderHook(
      ({ currentFolders }) =>
        useSavedTablesFilter({ items, folders: currentFolders, searchQuery: '' }),
      { initialProps: { currentFolders: folders } },
    );

    expect(result.current.ungroupedItems.map((item) => item.name)).toEqual(['Restored draft']);
    expect(result.current.itemsByFolder.get('folder-1')?.map((item) => item.name)).toEqual([
      'Kept',
    ]);

    rerender({ currentFolders: [] });

    expect(result.current.ungroupedItems.map((item) => item.name)).toEqual([
      'Restored draft',
      'Kept',
    ]);
    expect(result.current.itemsByFolder.size).toBe(0);
  });
});
