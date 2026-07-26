import { memo, useCallback, useEffect, useRef } from 'react';
import { Database, ChevronLeft, ChevronRight, Pencil, Trash2 } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/i18n/LocaleContext';

interface SavedTablesSidebarProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  activeNormalizedName?: string | null;
  activeDirty?: boolean;
  width?: number;
  minWidth?: number;
  maxWidth?: number;
  onResize?: (nextWidth: number) => void;
  onToggle: () => void;
  onSelect: (item: SavedTableSummary) => void;
  onRename: (item: SavedTableSummary) => void;
  onDelete: (item: SavedTableSummary) => void;
}

const formatDate = (timestamp: number, locale: string) =>
  new Date(timestamp).toLocaleDateString(locale, {
    month: '2-digit',
    day: '2-digit',
  });

export const SavedTablesSidebar = memo<SavedTablesSidebarProps>(
  ({
    open,
    loading,
    error,
    items,
    activeNormalizedName,
    activeDirty = false,
    width = 256,
    minWidth = 220,
    maxWidth = 360,
    onResize,
    onToggle,
    onSelect,
    onRename,
    onDelete,
  }) => {
    const { t } = useTranslation();
    const { resolvedLocale } = useLocale();
    const resizingRef = useRef(false);
    const startXRef = useRef(0);
    const startWidthRef = useRef(width);

    const clampWidth = useCallback(
      (value: number) => Math.min(maxWidth, Math.max(minWidth, value)),
      [minWidth, maxWidth],
    );

    const handleMouseDown = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (!open || !onResize) return;
        resizingRef.current = true;
        startXRef.current = event.clientX;
        startWidthRef.current = width;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
      },
      [open, onResize, width],
    );

    useEffect(() => {
      const handleMouseMove = (event: MouseEvent) => {
        if (!resizingRef.current || !onResize) return;
        const delta = event.clientX - startXRef.current;
        onResize(clampWidth(startWidthRef.current + delta));
      };
      const handleMouseUp = () => {
        if (!resizingRef.current) return;
        resizingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }, [clampWidth, onResize]);

    return (
      <aside
        className={cn(
          'relative flex flex-col rounded-lg border bg-card/95 shadow-lg shadow-primary/5 transition-all duration-300 lg:flex-none',
          open ? 'w-full lg:w-[var(--sidebar-width)]' : 'w-full lg:w-14',
        )}
        style={
          open
            ? ({
                '--sidebar-width': `${clampWidth(width)}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {open && onResize && (
          <div
            className="absolute right-0 top-0 hidden h-full w-1 cursor-ew-resize lg:block"
            onMouseDown={handleMouseDown}
            aria-hidden
          />
        )}
        <div className="relative flex items-center justify-between border-b border-primary/10 px-3 py-2">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" />
            <div className={cn('flex items-center gap-2', open ? 'block' : 'block lg:hidden')}>
              <span className="text-sm font-semibold">{t('savedTables.title')}</span>
              {items.length > 0 && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {items.length}
                </span>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggle}
            className="h-8 w-8"
            aria-label={open ? t('savedTables.collapse') : t('savedTables.expand')}
          >
            {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        <div className={cn('p-2', open ? 'block' : 'block lg:hidden')}>
          {loading && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              {t('savedTables.loading')}
            </div>
          )}
          {!loading && error && <div className="px-2 py-3 text-xs text-destructive">{error}</div>}
          {!loading && !error && items.length === 0 && (
            <div className="px-2 py-3 text-xs text-muted-foreground">{t('savedTables.empty')}</div>
          )}
          {!loading && !error && items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => {
                const isActive = activeNormalizedName === item.normalizedName;
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
                        {isActive && activeDirty && (
                          <span className="text-xs text-amber-600">*</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(item.updatedAt, resolvedLocale)}
                      </div>
                    </button>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onRename(item)}
                        aria-label={t('savedTables.rename')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => onDelete(item)}
                        aria-label={t('savedTables.delete')}
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
      </aside>
    );
  },
);
