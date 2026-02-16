import { memo, useState, useMemo, useCallback } from 'react';
import {
  Database,
  History,
  Pencil,
  Trash2,
  X,
  Search,
  Columns3,
  FolderPlus,
  FolderInput,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Drawer, DrawerClose, DrawerContent } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import type { FolderTreeNode } from '@/hooks/useFolders';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { FolderTree, useFolderExpansion } from './FolderTree';

interface SavedTablesDrawerProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  folders: FolderTreeNode[];
  foldersLoading?: boolean;
  activeNormalizedName?: string | null;
  activeDirty?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: SavedTableSummary) => void;
  onRename: (item: SavedTableSummary) => void;
  onDelete: (item: SavedTableSummary) => void;
  onViewHistory?: (item: SavedTableSummary) => void;
  onMoveToFolder?: (item: SavedTableSummary, folderId?: string) => void;
  onCreateFolder?: (parentId?: string) => void;
  onRenameFolder?: (folder: FolderTreeNode) => void;
  onDeleteFolder?: (folder: FolderTreeNode) => void;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });

const DB_ICON_MAP = Object.fromEntries(
  DATABASE_OPTIONS.map((option) => [option.value, option.icon]),
) as Record<string, React.ComponentType<{ className?: string }>>;

// 数据库图标映射
const DbIcon = memo<{ dbType: string; className?: string }>(
  ({ dbType, className }) => {
    const iconClass = cn('h-3.5 w-3.5', className);
    const Icon = DB_ICON_MAP[dbType] ?? Database;
    return <Icon className={iconClass} />;
  },
);
DbIcon.displayName = 'DbIcon';

// 表项组件
interface TableItemProps {
  item: SavedTableSummary;
  isActive: boolean;
  activeDirty: boolean;
  depth?: number;
  folders: FolderTreeNode[];
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onViewHistory?: () => void;
  onMoveToFolder?: (folderId?: string) => void;
}

const TableItem = memo<TableItemProps>(
  ({
    item,
    isActive,
    activeDirty,
    depth = 0,
    folders,
    onSelect,
    onRename,
    onDelete,
    onViewHistory,
    onMoveToFolder,
  }) => {
    const statusLabel = isActive ? (activeDirty ? '已修改' : '已加载') : '';

    // 递归构建文件夹菜单
    const renderFolderMenuItems = (
      folderList: FolderTreeNode[],
      currentFolderId?: string,
    ): React.ReactNode[] => {
      return folderList.map((folder) => (
        <div key={folder.id}>
          <DropdownMenuItem
            disabled={folder.id === currentFolderId}
            onClick={() => onMoveToFolder?.(folder.id)}
          >
            <span style={{ paddingLeft: `${folder.parentId ? 12 : 0}px` }}>
              📁 {folder.name}
            </span>
          </DropdownMenuItem>
          {folder.children.length > 0 &&
            renderFolderMenuItems(folder.children, currentFolderId)}
        </div>
      ));
    };

    return (
      <div
        className={cn(
          'group flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-accent',
          isActive && 'bg-accent/60',
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          type="button"
          className={cn(
            'min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-70',
          )}
          onClick={onSelect}
          disabled={isActive}
        >
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'truncate text-sm',
                isActive ? 'font-semibold' : 'font-medium',
              )}
            >
              {item.name}
            </span>
            {statusLabel && (
              <span className="text-xs text-muted-foreground">
                {statusLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            {/* 数据库类型图标 */}
            <span className="inline-flex items-center gap-1">
              <DbIcon dbType={item.dbType} />
              <span className="capitalize">{item.dbType}</span>
            </span>
            {/* 字段数量 */}
            <span className="inline-flex items-center gap-1">
              <Columns3 className="h-3 w-3" />
              {item.fieldCount} 字段
            </span>
            {/* 日期 */}
            <span>{formatDate(item.updatedAt)}</span>
          </div>
        </button>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onViewHistory && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onViewHistory}
              aria-label="历史版本"
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          )}
          {onMoveToFolder && folders.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="移动到文件夹"
                >
                  <FolderInput className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-48 max-h-64 overflow-y-auto"
              >
                <DropdownMenuItem
                  disabled={!item.folderId}
                  onClick={() => onMoveToFolder(undefined)}
                >
                  📂 移到根目录
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {renderFolderMenuItems(folders, item.folderId)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRename}
            aria-label="重命名"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            aria-label="删除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  },
);
TableItem.displayName = 'TableItem';

export const SavedTablesDrawer = memo<SavedTablesDrawerProps>(
  ({
    open,
    loading,
    error,
    items,
    folders,
    foldersLoading = false,
    activeNormalizedName,
    activeDirty = false,
    onOpenChange,
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

    // 为文件夹计算表数量
    const foldersWithCount = useMemo(() => {
      const countMap = new Map<string, number>();

      // 统计每个文件夹的直接表数量
      for (const item of items) {
        if (item.folderId) {
          countMap.set(item.folderId, (countMap.get(item.folderId) || 0) + 1);
        }
      }

      // 递归添加 tableCount
      const addCount = (folder: FolderTreeNode): FolderTreeNode => ({
        ...folder,
        tableCount: countMap.get(folder.id) || 0,
        children: folder.children.map(addCount),
      });

      return folders.map(addCount);
    }, [folders, items]);

    // 过滤逻辑
    const filteredItems = useMemo(() => {
      if (!searchQuery.trim()) return items;
      const query = searchQuery.toLowerCase().trim();
      return items.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.dbType.toLowerCase().includes(query),
      );
    }, [items, searchQuery]);

    // 未分组的表
    const ungroupedItems = useMemo(
      () => filteredItems.filter((item) => !item.folderId),
      [filteredItems],
    );

    // 渲染指定文件夹下的表
    const renderTables = useCallback(
      (folderId?: string) => {
        const folderItems = folderId
          ? filteredItems.filter((item) => item.folderId === folderId)
          : ungroupedItems;

        if (folderItems.length === 0) return null;

        // 如果是搜索模式，不区分文件夹，直接显示
        if (searchQuery.trim()) {
          return null; // 搜索模式下由平铺列表处理
        }

        return (
          <div className="ml-6">
            {folderItems.map((item) => (
              <TableItem
                key={item.normalizedName}
                item={item}
                isActive={activeNormalizedName === item.normalizedName}
                activeDirty={activeDirty}
                depth={folderId ? 1 : 0}
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
        );
      },
      [
        filteredItems,
        ungroupedItems,
        searchQuery,
        activeNormalizedName,
        activeDirty,
        foldersWithCount,
        onSelect,
        onRename,
        onDelete,
        onViewHistory,
        onMoveToFolder,
      ],
    );

    const hasFolders = folders.length > 0;
    const isSearching = searchQuery.trim().length > 0;
    const isLoading = loading || foldersLoading;

    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex h-full flex-col p-0">
          <div className="flex items-center justify-between border-b border-primary/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">已保存的表</span>
              {items.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {items.length}
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

          {/* 搜索框 */}
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
            {!isLoading &&
              !error &&
              items.length > 0 &&
              filteredItems.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  未找到匹配的表
                </div>
              )}

            {/* 搜索模式：平铺显示所有匹配的表 */}
            {!isLoading &&
              !error &&
              isSearching &&
              filteredItems.length > 0 && (
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <TableItem
                      key={item.normalizedName}
                      item={item}
                      isActive={activeNormalizedName === item.normalizedName}
                      activeDirty={activeDirty}
                      folders={foldersWithCount}
                      onSelect={() => onSelect(item)}
                      onRename={() => onRename(item)}
                      onDelete={() => onDelete(item)}
                      onViewHistory={
                        onViewHistory ? () => onViewHistory(item) : undefined
                      }
                      onMoveToFolder={
                        onMoveToFolder
                          ? (targetFolderId) =>
                              onMoveToFolder(item, targetFolderId)
                          : undefined
                      }
                    />
                  ))}
                </div>
              )}

            {/* 非搜索模式：按文件夹树显示 */}
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
                // 无文件夹时的平铺显示
                <div className="space-y-2">
                  {filteredItems.map((item) => (
                    <TableItem
                      key={item.normalizedName}
                      item={item}
                      isActive={activeNormalizedName === item.normalizedName}
                      activeDirty={activeDirty}
                      folders={foldersWithCount}
                      onSelect={() => onSelect(item)}
                      onRename={() => onRename(item)}
                      onDelete={() => onDelete(item)}
                      onViewHistory={
                        onViewHistory ? () => onViewHistory(item) : undefined
                      }
                      onMoveToFolder={
                        onMoveToFolder
                          ? (targetFolderId) =>
                              onMoveToFolder(item, targetFolderId)
                          : undefined
                      }
                    />
                  ))}
                </div>
              ))}
          </div>
        </DrawerContent>
      </Drawer>
    );
  },
);
