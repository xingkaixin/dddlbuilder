import type React from 'react';
import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Columns3,
  Database,
  GripVertical,
  History,
  Pencil,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { cn } from '@/lib/utils';
import { DATABASE_OPTIONS } from '@/utils/constants';
import { toTableDragId } from './dnd';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/LocaleContext';

const formatDate = (timestamp: number, locale: string) =>
  new Date(timestamp).toLocaleDateString(locale, {
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
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onViewHistory?: () => void;
  dragDisabled?: boolean;
}

export const TableItem = memo<TableItemProps>(
  ({
    item,
    isActive,
    activeDirty,
    depth = 0,
    onSelect,
    onRename,
    onDelete,
    onViewHistory,
    dragDisabled = false,
  }) => {
    const { t } = useTranslation();
    const { resolvedLocale } = useLocale();
    const { attributes, listeners, setNodeRef, transform, transition } =
      useDraggable({
        id: toTableDragId(item.normalizedName),
        disabled: dragDisabled,
      });
    const statusLabel = isActive
      ? activeDirty
        ? t('savedTables.dirty')
        : t('savedTables.loaded')
      : '';

    return (
      <div
        ref={setNodeRef}
        className={cn(
          'group flex w-full items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-accent',
          isActive && 'bg-accent/60',
        )}
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        data-testid={`saved-table-row:${item.normalizedName}`}
      >
        <button
          type="button"
          className={cn(
            'mr-1 inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            dragDisabled &&
              'cursor-not-allowed opacity-40 hover:bg-transparent',
          )}
          aria-label={t('savedTables.dragTable')}
          disabled={dragDisabled}
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-table:${item.normalizedName}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
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
              {t('savedTables.fieldCount', { count: item.fieldCount })}
            </span>
            <span>{formatDate(item.updatedAt, resolvedLocale)}</span>
          </div>
        </button>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {onViewHistory && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onViewHistory}
              aria-label={t('savedTables.history')}
            >
              <History className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRename}
            aria-label={t('savedTables.rename')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
            aria-label={t('savedTables.delete')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  },
);

TableItem.displayName = 'TableItem';
