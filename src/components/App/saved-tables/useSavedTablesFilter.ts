import { useMemo } from 'react';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';

type UseSavedTablesFilterParams = {
  items: SavedTableSummary[];
  folders: FolderTreeNode[];
  searchQuery: string;
};

export function useSavedTablesFilter({
  items,
  folders,
  searchQuery,
}: UseSavedTablesFilterParams) {
  const foldersWithCount = useMemo(() => {
    const countMap = new Map<string, number>();

    for (const item of items) {
      if (item.folderId) {
        countMap.set(item.folderId, (countMap.get(item.folderId) || 0) + 1);
      }
    }

    const addCount = (folder: FolderTreeNode): FolderTreeNode => ({
      ...folder,
      tableCount: countMap.get(folder.id) || 0,
      children: folder.children.map(addCount),
    });

    return folders.map(addCount);
  }, [folders, items]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.dbType.toLowerCase().includes(query),
    );
  }, [items, searchQuery]);

  const ungroupedItems = useMemo(
    () => filteredItems.filter((item) => !item.folderId),
    [filteredItems],
  );

  const isSearching = searchQuery.trim().length > 0;

  return {
    foldersWithCount,
    filteredItems,
    ungroupedItems,
    isSearching,
  };
}
