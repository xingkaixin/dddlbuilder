import { memo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { FileEdit, GripVertical, MoreHorizontal, Pencil, Table2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { cn } from '@/lib/utils';
import { toTableDragId } from './dnd';
import { useTranslation } from 'react-i18next';

const drawerInteractiveButtonClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50';

export interface TableItemProps {
  item: SavedTableSummary;
  isActive: boolean;
  activeDirty: boolean;
  displayName?: string;
  isDirty?: boolean;
  isDraft?: boolean;
  depth?: number;
  onSelect: () => void;
  onRename?: () => void;
  onDelete: () => void;
  onViewHistory?: () => void;
  dragDisabled?: boolean;
}

export const TableItem = memo<TableItemProps>(
  ({
    item,
    isActive,
    activeDirty,
    displayName,
    isDirty,
    isDraft = false,
    depth = 0,
    onSelect,
    onRename,
    onDelete,
    dragDisabled = false,
  }) => {
    const { t } = useTranslation();
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
      id: toTableDragId(item.normalizedName),
      disabled: dragDisabled,
    });
    const showDirty = isDirty ?? (isActive && activeDirty);

    return (
      <div
        ref={setNodeRef}
        className={cn(
          'group relative flex w-full items-center gap-1 rounded-md px-2 py-1.5 transition-colors hover:bg-accent focus-within:bg-accent',
          isActive && 'bg-accent/60',
        )}
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          transform: CSS.Transform.toString(transform),
        }}
        data-testid={`saved-table-row:${item.normalizedName}`}
      >
        <button
          type="button"
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            drawerInteractiveButtonClass,
            dragDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
          )}
          aria-label={t('savedTables.dragTable')}
          disabled={dragDisabled}
          {...attributes}
          {...listeners}
          data-testid={`drag-handle-table:${item.normalizedName}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span
          aria-hidden="true"
          className="inline-flex h-5 w-5 shrink-0"
          data-testid={`table-expand-placeholder:${item.normalizedName}`}
        />
        <button
          type="button"
          data-testid={`table-select:${item.normalizedName}`}
          className={cn(
            'min-w-0 flex-1 rounded-sm text-left disabled:cursor-not-allowed disabled:opacity-70',
            drawerInteractiveButtonClass,
          )}
          onClick={onSelect}
        >
          <div className="flex items-center gap-1">
            {isDraft ? (
              <FileEdit
                className="h-4 w-4 shrink-0 text-amber-600/80"
                data-testid={`table-icon:${item.normalizedName}`}
              />
            ) : (
              <Table2
                className="h-4 w-4 shrink-0 text-primary/80"
                data-testid={`table-icon:${item.normalizedName}`}
              />
            )}
            <span className={cn('truncate text-sm', isActive ? 'font-semibold' : 'font-medium')}>
              {displayName ?? item.name}
            </span>
            {showDirty && <span className="text-xs text-amber-600">*</span>}
            {isDraft && (
              <span
                className="rounded bg-amber-500/10 px-1 py-0 text-[10px] text-amber-600"
                data-testid={`draft-badge:${item.normalizedName}`}
              >
                {t('savedTables.draftLabel')}
              </span>
            )}
          </div>
        </button>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-accent via-accent/90 to-transparent opacity-80 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          data-testid={`table-actions-mask:${item.normalizedName}`}
        />
        <div
          className="absolute right-2 top-1/2 z-20 flex -translate-y-1/2 items-center opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          data-testid={`table-actions:${item.normalizedName}`}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-7 w-7', drawerInteractiveButtonClass)}
                aria-label={t('savedTables.actions')}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {onRename && !isDraft && (
                <DropdownMenuItem onClick={onRename}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {t('savedTables.rename')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                {t('savedTables.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  },
);

TableItem.displayName = 'TableItem';
