import { memo, useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
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
import { useTranslation } from 'react-i18next';
import { Input } from '../ui/input';
import { FolderTree, useFolderExpansion } from './FolderTree';
import { TableItem } from './saved-tables/TableItem';
import {
  ROOT_DROP_ID,
  buildFolderParentMap,
  resolveDropAction,
} from './saved-tables/dnd';
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
  onMoveToFolder?: (
    item: SavedTableSummary,
    folderId?: string,
  ) => Promise<void> | void;
  onMoveFolder?: (
    folder: FolderTreeNode,
    parentId?: string,
  ) => Promise<void> | void;
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
      className={`mb-2 rounded-md border border-dashed px-3 py-2 text-xs transition-colors ${
        disabled
          ? 'border-border text-muted-foreground opacity-60'
          : isOver
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border text-muted-foreground'
      }`}
      aria-disabled={disabled}
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
    onMoveFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
  }) => {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');
    const { expandedFolders, toggleFolder, expandFolder } =
      useFolderExpansion();
    const [selectedFolderId, setSelectedFolderId] = useState<
      string | undefined
    >();
    const sensors = useSensors(
      useSensor(PointerSensor, {
        activationConstraint: { distance: 6 },
      }),
    );

    const { foldersWithCount, filteredItems, ungroupedItems, isSearching } =
      useSavedTablesFilter({
        items,
        folders,
        searchQuery,
      });

    const itemMap = useMemo(
      () => new Map(items.map((item) => [item.normalizedName, item])),
      [items],
    );
    const tableFolderMap = useMemo(
      () =>
        items.reduce<Record<string, string | undefined>>((acc, item) => {
          acc[item.normalizedName] = item.folderId;
          return acc;
        }, {}),
      [items],
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
              onSelect={() => onSelect(item)}
              onRename={() => onRename(item)}
              onDelete={() => onDelete(item)}
              onViewHistory={
                onViewHistory ? () => onViewHistory(item) : undefined
              }
              dragDisabled={isSearching}
            />
          ))}
        </div>
      ),
      [
        activeDirty,
        activeNormalizedName,
        isSearching,
        onDelete,
        onRename,
        onSelect,
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

        if (action.kind === 'none') {
          return;
        }

        if (action.kind === 'move_table') {
          if (!onMoveToFolder) return;
          const item = itemMap.get(action.normalizedName);
          if (!item) return;
          await Promise.resolve(onMoveToFolder(item, action.folderId));
          if (action.folderId) {
            expandFolder(action.folderId);
          }
          return;
        }

        if (action.kind === 'move_folder') {
          if (!onMoveFolder) return;
          const folder = folderNodeMap.get(action.folderId);
          if (!folder) return;
          await Promise.resolve(onMoveFolder(folder, action.parentId));
          if (action.parentId) {
            expandFolder(action.parentId);
          }
          return;
        }

        if (!onMoveFolder) return;
        const folder = folderNodeMap.get(action.folderId);
        if (!folder) return;
        await Promise.resolve(onMoveFolder(folder, action.parentId));
      },
      [
        expandFolder,
        folderNodeMap,
        folderParentMap,
        isSearching,
        itemMap,
        onMoveFolder,
        onMoveToFolder,
        tableFolderMap,
      ],
    );

    const hasFolders = folders.length > 0;
    const hasVisibleContent =
      filteredItems.length > 0 || foldersWithCount.length > 0;
    const isLoading = loading || foldersLoading;

    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex h-full flex-col p-0">
          <div className="sr-only">
            <DrawerTitle>{t('savedTables.title')}</DrawerTitle>
            <DrawerDescription>
              {t('savedTables.drawerDescription')}
            </DrawerDescription>
          </div>
          <div className="flex items-center justify-between border-b border-primary/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">
                {t('savedTables.title')}
              </span>
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
                  aria-label={t('savedTables.createFolder')}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                </Button>
              )}
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={t('savedTables.close')}
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
                  placeholder={t('savedTables.searchPlaceholder')}
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
                {t('savedTables.loading')}
              </output>
            )}
            {!isLoading && error && (
              <div role="alert" className="px-2 py-3 text-xs text-destructive">
                {error}
              </div>
            )}
            {!isLoading && !error && items.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                {t('savedTables.emptyHint')}
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
                      {t('savedTables.draft')}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t('savedTables.draftMeta', {
                        dbType: draftItem.dbType,
                        count: draftItem.fieldCount,
                      })}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {draftActive
                      ? t('savedTables.loaded')
                      : t('savedTables.clickToLoad')}
                  </span>
                </button>
              </div>
            )}
            {!isLoading &&
              !error &&
              items.length > 0 &&
              filteredItems.length === 0 && (
                <div className="px-2 py-3 text-xs text-muted-foreground">
                  {t('savedTables.noMatch')}
                </div>
              )}

            {!isLoading && !error && hasVisibleContent && (
              <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                <RootDropZone disabled={isSearching} />
                {isSearching ? (
                  renderTableList(filteredItems)
                ) : hasFolders &&
                  onCreateFolder &&
                  onRenameFolder &&
                  onDeleteFolder ? (
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
