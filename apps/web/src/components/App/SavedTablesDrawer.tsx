import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Database, FilePlus, FolderPlus, Search, X } from 'lucide-react';
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
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import { FolderTree, useFolderExpansion } from './FolderTree';
import { TableItem } from './saved-tables/TableItem';
import { ROOT_DROP_ID, buildFolderParentMap, resolveDropAction } from './saved-tables/dnd';
import { useSavedTablesFilter } from './saved-tables/useSavedTablesFilter';

type MoveOperationResult = { ok: boolean; message?: string };
const drawerIconButtonClass =
  'h-7 w-7 text-muted-foreground/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50';

export interface SavedTablesDrawerProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  draftItems?: DraftSummary[];
  activeDraftId?: string | null;
  folders: FolderTreeNode[];
  foldersLoading?: boolean;
  showSearchWhenEmpty?: boolean;
  activeNormalizedName?: string | null;
  activeDirty?: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDraft?: (draftId: string) => void;
  onCreateDraft?: () => void;
  onDeleteDraft?: (draftId: string) => void;
  onSelect: (item: SavedTableSummary) => void;
  onRename: (item: SavedTableSummary) => void;
  onDelete: (item: SavedTableSummary) => void;
  onViewHistory?: (item: SavedTableSummary) => void;
  onMoveToFolder?: (
    item: SavedTableSummary,
    folderId?: string,
  ) => MoveOperationResult | Promise<MoveOperationResult | undefined> | undefined;
  onMoveFolder?: (
    folder: FolderTreeNode,
    parentId?: string,
  ) => MoveOperationResult | Promise<MoveOperationResult | undefined> | undefined;
  onCreateFolder?: (parentId?: string) => void;
  onRenameFolder?: (folder: FolderTreeNode) => void;
  onDeleteFolder?: (folder: FolderTreeNode) => void;
}

interface RootDropZoneProps {
  disabled: boolean;
}

const RootDropZone = memo<RootDropZoneProps>(({ disabled }) => {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: ROOT_DROP_ID,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      className={`mb-3 rounded-lg border-2 border-dashed bg-gradient-to-r px-3 py-2 text-xs font-medium transition-all ${
        disabled
          ? 'from-muted/20 to-transparent border-border/70 text-muted-foreground/80 opacity-70'
          : isOver
            ? 'from-primary/20 to-primary/5 border-primary bg-primary/10 text-primary shadow-sm shadow-primary/25'
            : 'from-muted/35 to-muted/5 border-border/80 text-muted-foreground'
      }`}
      aria-disabled={disabled}
      data-drag-over={isOver ? 'true' : 'false'}
      data-testid="root-dropzone"
    >
      {t('savedTables.rootDropzone')}
    </div>
  );
});
RootDropZone.displayName = 'RootDropZone';

export const SavedTablesDrawer = memo<SavedTablesDrawerProps>(
  ({
    open,
    loading,
    error,
    items,
    draftItems = [],
    activeDraftId,
    folders,
    foldersLoading = false,
    showSearchWhenEmpty = true,
    activeNormalizedName,
    activeDirty = false,
    onOpenChange,
    onSelectDraft,
    onCreateDraft,
    onDeleteDraft,
    onSelect,
    onRename,
    onDelete,
    onViewHistory,
    onMoveToFolder,
    onMoveFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
  }) => {
    const { t } = useTranslation();
    const trackEvent = useCallback((..._args: unknown[]) => {}, []);
    const [searchQuery, setSearchQuery] = useState('');
    const [dragFeedback, setDragFeedback] = useState<{
      type: 'success' | 'blocked' | 'error';
      message: string;
    } | null>(null);
    const dragFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const { expandedFolders, toggleFolder, expandFolder } = useFolderExpansion();
    const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>();
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 6 },
      }),
    );

    const draftAsSavedItems = useMemo<SavedTableSummary[]>(
      () =>
        draftItems.map((d) => ({
          normalizedName: d.draftId,
          name: d.name,
          dbType: d.dbType,
          fieldCount: d.fieldCount,
          updatedAt: d.updatedAt,
          folderId: d.folderId,
          createdAt: d.updatedAt,
        })),
      [draftItems],
    );
    const allItems = useMemo(() => [...draftAsSavedItems, ...items], [draftAsSavedItems, items]);
    const draftIdSet = useMemo(() => new Set(draftItems.map((d) => d.draftId)), [draftItems]);

    const { foldersWithCount, filteredItems, ungroupedItems, isSearching } = useSavedTablesFilter({
      items: allItems,
      folders,
      searchQuery,
    });

    const itemMap = useMemo(
      () => new Map(allItems.map((item) => [item.normalizedName, item])),
      [allItems],
    );
    const tableFolderMap = useMemo(
      () =>
        allItems.reduce<Record<string, string | undefined>>((acc, item) => {
          acc[item.normalizedName] = item.folderId;
          return acc;
        }, {}),
      [allItems],
    );
    const folderParentMap = useMemo(
      () => buildFolderParentMap(foldersWithCount),
      [foldersWithCount],
    );
    const folderNodeMap = useMemo(() => {
      const map = new Map<string, FolderTreeNode>();
      const walk = (nodes: FolderTreeNode[]) => {
        for (const node of nodes) {
          map.set(node.id, node);
          walk(node.children);
        }
      };
      walk(foldersWithCount);
      return map;
    }, [foldersWithCount]);

    useEffect(
      () => () => {
        if (dragFeedbackTimerRef.current) {
          clearTimeout(dragFeedbackTimerRef.current);
        }
      },
      [],
    );

    const showDragFeedback = useCallback(
      (type: 'success' | 'blocked' | 'error', message: string) => {
        setDragFeedback({ type, message });
        if (dragFeedbackTimerRef.current) {
          clearTimeout(dragFeedbackTimerRef.current);
        }
        dragFeedbackTimerRef.current = setTimeout(() => {
          setDragFeedback(null);
        }, 2400);
      },
      [],
    );

    const renderTableList = useCallback(
      (tableItems: SavedTableSummary[], depth = 0) => (
        <div className="space-y-2">
          {tableItems.map((item) => {
            const isDraft = draftIdSet.has(item.normalizedName);
            const isActive = isDraft
              ? activeDraftId === item.normalizedName
              : activeNormalizedName === item.normalizedName;
            return (
              <TableItem
                key={item.normalizedName}
                item={item}
                isActive={isActive}
                activeDirty={activeDirty}
                isDraft={isDraft}
                depth={depth}
                onSelect={() => (isDraft ? onSelectDraft?.(item.normalizedName) : onSelect(item))}
                onRename={isDraft ? undefined : () => onRename(item)}
                onDelete={() => (isDraft ? onDeleteDraft?.(item.normalizedName) : onDelete(item))}
                onViewHistory={isDraft || !onViewHistory ? undefined : () => onViewHistory(item)}
                dragDisabled={isSearching || isDraft}
              />
            );
          })}
        </div>
      ),
      [
        activeDirty,
        activeNormalizedName,
        activeDraftId,
        draftIdSet,
        isSearching,
        onDelete,
        onDeleteDraft,
        onRename,
        onSelect,
        onSelectDraft,
        onViewHistory,
      ],
    );

    const renderTables = useCallback(
      (folderId?: string, depth = 0) => {
        const folderItems = folderId
          ? filteredItems.filter((item) => item.folderId === folderId)
          : ungroupedItems;

        if (folderItems.length === 0) return null;

        if (isSearching) {
          return null;
        }

        if (!folderId) {
          return renderTableList(folderItems, 0);
        }

        return (
          <div style={{ marginLeft: `${(depth + 1) * 16}px` }}>
            {renderTableList(folderItems, 0)}
          </div>
        );
      },
      [filteredItems, isSearching, renderTableList, ungroupedItems],
    );

    const handleDragEnd = useCallback(
      async (event: DragEndEvent) => {
        const action = resolveDropAction({
          activeId: event.active.id,
          overId: event.over?.id ?? null,
          isSearching,
          tableFolderMap,
          folderParentMap,
        });

        trackEvent('saved_tables_drag_attempt', {
          action: action.kind,
          reason: action.reason,
          hasTarget: Boolean(event.over?.id),
        });

        switch (action.kind) {
          case 'none':
            return;
          case 'invalid_folder_cycle': {
            showDragFeedback('blocked', t('savedTables.dragFeedback.folderCycle'));
            trackEvent('saved_tables_drag_blocked', {
              reason: action.reason,
            });
            return;
          }
          case 'move_table': {
            if (!onMoveToFolder) return;
            const item = itemMap.get(action.normalizedName);
            if (!item) return;
            try {
              const result = await Promise.resolve(onMoveToFolder(item, action.folderId));
              if (result && result.ok === false) {
                showDragFeedback(
                  'error',
                  result.message ?? t('savedTables.dragFeedback.moveFailed'),
                );
                return;
              }
              if (action.folderId) {
                expandFolder(action.folderId);
              }
              showDragFeedback(
                'success',
                action.folderId
                  ? t('savedTables.dragFeedback.tableMovedToFolder', {
                      name:
                        folderNodeMap.get(action.folderId)?.name ??
                        t('savedTables.dragFeedback.unknownFolder'),
                    })
                  : t('savedTables.dragFeedback.tableMovedToRoot'),
              );
              trackEvent('saved_tables_drag_success', {
                entity: 'table',
                reason: action.reason,
                target: action.folderId ?? 'root',
              });
            } catch {
              showDragFeedback('error', t('savedTables.dragFeedback.moveFailed'));
            }
            return;
          }
          case 'move_folder': {
            if (!onMoveFolder) return;
            const folder = folderNodeMap.get(action.folderId);
            if (!folder) return;
            try {
              const result = await Promise.resolve(onMoveFolder(folder, action.parentId));
              if (result && result.ok === false) {
                showDragFeedback(
                  'error',
                  result.message ?? t('savedTables.dragFeedback.moveFailed'),
                );
                return;
              }
              if (action.parentId) {
                expandFolder(action.parentId);
              }
              showDragFeedback(
                'success',
                action.parentId
                  ? t('savedTables.dragFeedback.folderMovedToFolder', {
                      name:
                        folderNodeMap.get(action.parentId)?.name ??
                        t('savedTables.dragFeedback.unknownFolder'),
                    })
                  : t('savedTables.dragFeedback.folderMovedToRoot'),
              );
              trackEvent('saved_tables_drag_success', {
                entity: 'folder',
                reason: action.reason,
                target: action.parentId ?? 'root',
              });
            } catch {
              showDragFeedback('error', t('savedTables.dragFeedback.moveFailed'));
            }
            return;
          }
          default: {
            const _exhaustiveCheck: never = action;
            return _exhaustiveCheck;
          }
        }
      },
      [
        expandFolder,
        folderNodeMap,
        folderParentMap,
        isSearching,
        itemMap,
        onMoveFolder,
        onMoveToFolder,
        showDragFeedback,
        tableFolderMap,
        t,
        trackEvent,
      ],
    );

    const hasFolders = folders.length > 0;
    const hasVisibleContent = filteredItems.length > 0 || foldersWithCount.length > 0;
    const isLoading = loading || foldersLoading;
    const canSearch = allItems.length > 0;

    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex h-full flex-col p-0">
          <div className="sr-only">
            <DrawerTitle>{t('savedTables.title')}</DrawerTitle>
            <DrawerDescription>{t('savedTables.drawerDescription')}</DrawerDescription>
          </div>
          <div className="flex items-center justify-between border-b border-primary/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">{t('savedTables.title')}</span>
              {(items.length > 0 || draftItems.length > 0) && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {items.length + draftItems.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {onCreateDraft && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={drawerIconButtonClass}
                  onClick={() => onCreateDraft()}
                  aria-label={t('savedTables.createDraft')}
                >
                  <FilePlus className="h-3.5 w-3.5" />
                </Button>
              )}
              {onCreateFolder && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={drawerIconButtonClass}
                  onClick={() => onCreateFolder()}
                  aria-label={t('savedTables.createFolder')}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              )}
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={drawerIconButtonClass}
                  aria-label={t('savedTables.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </DrawerClose>
            </div>
          </div>

          {!isLoading && !error && showSearchWhenEmpty && (
            <div className="border-b border-primary/10 px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('savedTables.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  disabled={!canSearch}
                  className="h-8 pl-8 text-xs disabled:cursor-not-allowed disabled:opacity-70"
                  data-testid="saved-tables-search"
                />
              </div>
              {!canSearch && (
                <p className="mt-1 px-0.5 text-[11px] text-muted-foreground">
                  {t('savedTables.searchDisabledHint')}
                </p>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {isLoading && (
              <output
                aria-live="polite"
                aria-busy="true"
                className="px-2 py-3 text-xs text-muted-foreground"
              >
                {t('savedTables.loading')}
              </output>
            )}
            {!isLoading && error && (
              <div role="alert" className="px-2 py-3 text-xs text-destructive">
                {error}
              </div>
            )}
            {!isLoading && !error && allItems.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                {t('savedTables.emptyHint')}
              </div>
            )}
            {!isLoading && !error && allItems.length > 0 && filteredItems.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                {t('savedTables.noMatch')}
              </div>
            )}

            {!isLoading && !error && hasVisibleContent && (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <RootDropZone disabled={isSearching} />
                {dragFeedback && (
                  <div
                    role={dragFeedback.type === 'error' ? 'alert' : 'status'}
                    className={`mb-3 rounded-md px-2.5 py-2 text-xs ${
                      dragFeedback.type === 'success'
                        ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : dragFeedback.type === 'blocked'
                          ? 'border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                          : 'border border-destructive/30 bg-destructive/10 text-destructive'
                    }`}
                    data-testid="saved-tables-drag-feedback"
                  >
                    {dragFeedback.message}
                  </div>
                )}
                {isSearching ? (
                  renderTableList(filteredItems)
                ) : hasFolders && onCreateFolder && onRenameFolder && onDeleteFolder ? (
                  <FolderTree
                    folders={foldersWithCount}
                    expandedFolders={expandedFolders}
                    selectedFolderId={selectedFolderId}
                    dragDisabled={isSearching}
                    onToggleFolder={toggleFolder}
                    onSelectFolder={setSelectedFolderId}
                    onCreateFolder={onCreateFolder}
                    onRenameFolder={onRenameFolder}
                    onDeleteFolder={onDeleteFolder}
                    renderTables={renderTables}
                  />
                ) : (
                  renderTableList(filteredItems)
                )}
              </DndContext>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  },
);

SavedTablesDrawer.displayName = 'SavedTablesDrawer';
