import { memo } from 'react';
import { Database, Pencil, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerClose, DrawerContent } from '@/components/ui/drawer';
import type { SavedTableSummary } from '@/hooks/useSavedTables';

interface SavedTablesDrawerProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  activeNormalizedName?: string | null;
  activeDirty?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: SavedTableSummary) => void;
  onRename: (item: SavedTableSummary) => void;
  onDelete: (item: SavedTableSummary) => void;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });

export const SavedTablesDrawer = memo<SavedTablesDrawerProps>(
  ({
    open,
    loading,
    error,
    items,
    activeNormalizedName,
    activeDirty = false,
    onOpenChange,
    onSelect,
    onRename,
    onDelete,
  }) => {
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
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </Button>
            </DrawerClose>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {loading && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                正在读取保存的表...
              </div>
            )}
            {!loading && error && (
              <div className="px-2 py-3 text-xs text-destructive">{error}</div>
            )}
            {!loading && !error && items.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                还没有保存的表
              </div>
            )}
            {!loading && !error && items.length > 0 && (
              <div className="space-y-2">
                {items.map((item) => {
                  const isActive = activeNormalizedName === item.normalizedName;
                  const statusLabel = isActive
                    ? activeDirty
                      ? '已修改'
                      : '已加载'
                    : '';
                  return (
                    <div
                      key={item.normalizedName}
                      className={cn(
                        'group flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-accent',
                        isActive && 'bg-accent/60',
                      )}
                    >
                      <button
                        type="button"
                        className={cn(
                          'min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-70',
                        )}
                        onClick={() => onSelect(item)}
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
                        <div className="text-xs text-muted-foreground">
                          {formatDate(item.updatedAt)}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onRename(item)}
                          aria-label="重命名"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => onDelete(item)}
                          aria-label="删除"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  },
);
