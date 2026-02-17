import type React from 'react';
import { memo } from 'react';
import {
  Columns3,
  Database,
  FolderInput,
  History,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { cn } from '@/lib/utils';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { renderFolderMenuItems } from './folderMenu';

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });

const DB_ICON_MAP = Object.fromEntries(
  DATABASE_OPTIONS.map((option) => [option.value, option.icon]),
) as Record<string, React.ComponentType<{ className?: string }>>;

const DbIcon = memo<{ dbType: string; className?: string }>(
  ({ dbType, className }) => {
    const iconClass = cn('h-3.5 w-3.5', className);
    const Icon = DB_ICON_MAP[dbType] ?? Database;
    return <Icon className={iconClass} />;
  },
);
DbIcon.displayName = 'DbIcon';

export interface TableItemProps {
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

export const TableItem = memo<TableItemProps>(
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
            <span className="inline-flex items-center gap-1">
              <DbIcon dbType={item.dbType} />
              <span className="capitalize">{item.dbType}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Columns3 className="h-3 w-3" />
              {item.fieldCount} 字段
            </span>
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
                {renderFolderMenuItems(folders, item.folderId, onMoveToFolder)}
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
