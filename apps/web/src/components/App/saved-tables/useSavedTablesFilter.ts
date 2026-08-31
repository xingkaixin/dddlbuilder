import { useMemo } from 'react';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { getAllFolderTreeNodeIds } from '@/utils/folderModel';

type UseSavedTablesFilterParams = {
  items: SavedTableSummary[];
  folders: FolderTreeNode[];
  searchQuery: string;
};

export function useSavedTablesFilter({ items, folders, searchQuery }: UseSavedTablesFilterParams) {
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

  const { filteredItems, itemsByFolder, ungroupedItems } = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const filtered = query
      ? items.filter(
          (item) =>
            item.name.toLowerCase().includes(query) || item.dbType.toLowerCase().includes(query),
        )
      : items;
    const grouped = new Map<string, SavedTableSummary[]>();
    const ungrouped: SavedTableSummary[] = [];
    const folderIds = new Set(getAllFolderTreeNodeIds(folders));

    for (const item of filtered) {
      if (!item.folderId || !folderIds.has(item.folderId)) {
        ungrouped.push(item);
        continue;
      }
      const folderItems = grouped.get(item.folderId);
      if (folderItems) {
        folderItems.push(item);
      } else {
        grouped.set(item.folderId, [item]);
      }
    }

    return {
      filteredItems: filtered,
      itemsByFolder: grouped,
      ungroupedItems: ungrouped,
    };
  }, [folders, items, searchQuery]);

  const isSearching = searchQuery.trim().length > 0;

  return {
    foldersWithCount,
    filteredItems,
    itemsByFolder,
    ungroupedItems,
    isSearching,
  };
}
