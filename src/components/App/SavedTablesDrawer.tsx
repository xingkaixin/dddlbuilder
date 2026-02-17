import { memo, useCallback, useState } from 'react';
import { Database, FolderPlus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import type { GlobalDraftSummary } from '@/types/workspace';
import { Input } from '../ui/input';
import { FolderTree, useFolderExpansion } from './FolderTree';
import { TableItem } from './saved-tables/TableItem';
import { useSavedTablesFilter } from './saved-tables/useSavedTablesFilter';

export interface SavedTablesDrawerProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  draftItem?: GlobalDraftSummary | null;
  draftActive?: boolean;
  folders: FolderTreeNode[];
  foldersLoading?: boolean;
  activeNormalizedName?: string | null;
  activeDirty?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDraft?: () => void;
  onSelect: (item: SavedTableSummary) => void;
  onRename: (item: SavedTableSummary) => void;
  onDelete: (item: SavedTableSummary) => void;
  onViewHistory?: (item: SavedTableSummary) => void;
  onMoveToFolder?: (item: SavedTableSummary, folderId?: string) => void;
  onCreateFolder?: (parentId?: string) => void;
  onRenameFolder?: (folder: FolderTreeNode) => void;
  onDeleteFolder?: (folder: FolderTreeNode) => void;
}

export const SavedTablesDrawer = memo<SavedTablesDrawerProps>(
  ({
    open,
    loading,
    error,
    items,
    draftItem,
    draftActive = false,
    folders,
    foldersLoading = false,
    activeNormalizedName,
    activeDirty = false,
    onOpenChange,
    onSelectDraft,
    onSelect,
    onRename,
    onDelete,
    onViewHistory,
    onMoveToFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
  }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const { expandedFolders, toggleFolder } = useFolderExpansion();
    const [selectedFolderId, setSelectedFolderId] = useState<
      string | undefined
    >();

    const { foldersWithCount, filteredItems, ungroupedItems, isSearching } =
      useSavedTablesFilter({
        items,
        folders,
        searchQuery,
      });

    const renderTableList = useCallback(
      (tableItems: SavedTableSummary[], depth = 0) => (
        <div className="space-y-2">
          {tableItems.map((item) => (
            <TableItem
              key={item.normalizedName}
              item={item}
              isActive={activeNormalizedName === item.normalizedName}
              activeDirty={activeDirty}
              depth={depth}
              folders={foldersWithCount}
              onSelect={() => onSelect(item)}
              onRename={() => onRename(item)}
              onDelete={() => onDelete(item)}
              onViewHistory={
                onViewHistory ? () => onViewHistory(item) : undefined
              }
              onMoveToFolder={
                onMoveToFolder
                  ? (targetFolderId) => onMoveToFolder(item, targetFolderId)
                  : undefined
              }
            />
          ))}
        </div>
      ),
      [
        activeDirty,
        activeNormalizedName,
        foldersWithCount,
        onDelete,
        onMoveToFolder,
        onRename,
        onSelect,
        onViewHistory,
      ],
    );

    const renderTables = useCallback(
      (folderId?: string) => {
        const folderItems = folderId
          ? filteredItems.filter((item) => item.folderId === folderId)
          : ungroupedItems;

        if (folderItems.length === 0) return null;

        if (isSearching) {
          return null;
        }

        return (
          <div className="ml-6">
            {renderTableList(folderItems, folderId ? 1 : 0)}
          </div>
        );
      },
      [filteredItems, isSearching, renderTableList, ungroupedItems],
    );

    const hasFolders = folders.length > 0;
    const isLoading = loading || foldersLoading;

    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex h-full flex-col p-0">
          <div className="sr-only">
            <DrawerTitle>已保存的表</DrawerTitle>
            <DrawerDescription>
              管理和浏览已保存的数据库表配置
            </DrawerDescription>
          </div>
          <div className="flex items-center justify-between border-b border-primary/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">已保存的表</span>
              {(items.length > 0 || draftItem) && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {items.length + (draftItem ? 1 : 0)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {onCreateFolder && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onCreateFolder()}
                  aria-label="新建文件夹"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              )}
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="关闭"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </DrawerClose>
            </div>
          </div>

          {!isLoading && !error && items.length > 0 && (
            <div className="border-b border-primary/10 px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="搜索表名或数据库类型..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {isLoading && (
              <output
                aria-live="polite"
                aria-busy="true"
                className="px-2 py-3 text-xs text-muted-foreground"
              >
                正在读取保存的表...
              </output>
            )}
            {!isLoading && error && (
              <div role="alert" className="px-2 py-3 text-xs text-destructive">
                {error}
              </div>
            )}
            {!isLoading && !error && items.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                还没有保存的表，点击上方「保存表」按钮保存第一个表
              </div>
            )}
            {!isLoading && !error && draftItem && onSelectDraft && (
              <div className="mb-3">
                <button
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                    draftActive
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border bg-card hover:bg-accent'
                  }`}
                  onClick={onSelectDraft}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      全局草稿箱
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      自动保存 · {draftItem.dbType} · {draftItem.fieldCount}{' '}
                      字段
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {draftActive ? '已加载' : '点击加载'}
                  </span>
                </button>
              </div>
            )}
            {!isLoading &&
              !error &&
              items.length > 0 &&
              filteredItems.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  未找到匹配的表
                </div>
              )}

            {!isLoading &&
              !error &&
              isSearching &&
              filteredItems.length > 0 &&
              renderTableList(filteredItems)}

            {!isLoading &&
              !error &&
              !isSearching &&
              filteredItems.length > 0 &&
              (hasFolders &&
              onCreateFolder &&
              onRenameFolder &&
              onDeleteFolder ? (
                <FolderTree
                  folders={foldersWithCount}
                  expandedFolders={expandedFolders}
                  selectedFolderId={selectedFolderId}
                  onToggleFolder={toggleFolder}
                  onSelectFolder={setSelectedFolderId}
                  onCreateFolder={onCreateFolder}
                  onRenameFolder={onRenameFolder}
                  onDeleteFolder={onDeleteFolder}
                  renderTables={renderTables}
                />
              ) : (
                renderTableList(filteredItems)
              ))}
          </div>
        </DrawerContent>
      </Drawer>
    );
  },
);

SavedTablesDrawer.displayName = 'SavedTablesDrawer';
