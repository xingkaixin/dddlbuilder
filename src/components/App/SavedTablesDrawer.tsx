import { memo, useState, useMemo } from 'react';
import {
  Database,
  History,
  Pencil,
  Trash2,
  X,
  Search,
  Columns3,
} from 'lucide-react';
import { DiMysql, DiMsqlServer } from 'react-icons/di';
import { SiPostgresql, SiOracle, SiMariadbfoundation } from 'react-icons/si';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  onViewHistory?: (item: SavedTableSummary) => void;
}

const formatDate = (timestamp: number) =>
  new Date(timestamp).toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });

// 数据库图标映射
const DbIcon = memo<{ dbType: string; className?: string }>(
  ({ dbType, className }) => {
    const iconClass = cn('h-3.5 w-3.5', className);

    switch (dbType) {
      case 'mysql':
      case 'tidb':
      case 'dm':
      case 'oceanbase':
        return <DiMysql className={iconClass} />;
      case 'postgresql':
      case 'postgresql-citus':
        return <SiPostgresql className={iconClass} />;
      case 'sqlserver':
        return <DiMsqlServer className={iconClass} />;
      case 'oracle':
      case 'oceanbase-oracle':
        return <SiOracle className={iconClass} />;
      case 'mariadb':
        return <SiMariadbfoundation className={iconClass} />;
      default:
        return <Database className={iconClass} />;
    }
  },
);
DbIcon.displayName = 'DbIcon';

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
    onViewHistory,
  }) => {
    const [searchQuery, setSearchQuery] = useState('');

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

          {/* 搜索框 */}
          {!loading && !error && items.length > 0 && (
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
                还没有保存的表，点击上方「保存表」按钮保存第一个表
              </div>
            )}
            {!loading &&
              !error &&
              items.length > 0 &&
              filteredItems.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  未找到匹配的表
                </div>
              )}
            {!loading && !error && filteredItems.length > 0 && (
              <div className="space-y-2">
                {filteredItems.map((item) => {
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
                            onClick={() => onViewHistory(item)}
                            aria-label="历史版本"
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        )}
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
