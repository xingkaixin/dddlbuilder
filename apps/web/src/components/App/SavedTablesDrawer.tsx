import { memo, useCallback, useMemo } from 'react';
import { Database, FilePlus, FolderPlus, Search, X } from '@/components/icons';
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
import { TableItem } from './saved-tables/TableItem';
import { WorkspaceTreeView } from './saved-tables/WorkspaceTreeView';
import {
  useWorkspaceTreeControls,
  type MoveOperationResult,
} from './saved-tables/useWorkspaceTreeControls';

type TablePresentation = {
  title: string;
  isDirty: boolean;
};
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
  activeTableId?: string;
  activeDirty?: boolean;
  tablePresentations?: ReadonlyMap<string, TablePresentation>;
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
    activeTableId,
    activeDirty = false,
    tablePresentations,
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

    const draftAsSavedItems = useMemo<SavedTableSummary[]>(
      () =>
        draftItems.map((d) => ({
          tableId: `draft:${d.draftId}`,
          normalizedName: d.draftId,
          name: d.name,
          dbType: d.dbType,
          fieldCount: d.fieldCount,
          updatedAt: d.updatedAt,
          folderId: d.folderId,
          createdAt: d.createdAt,
        })),
      [draftItems],
    );
    const allItems = useMemo(() => [...draftAsSavedItems, ...items], [draftAsSavedItems, items]);
    const draftIdSet = useMemo(
      () => new Set(draftAsSavedItems.map((d) => d.tableId)),
      [draftAsSavedItems],
    );
    const treeControls = useWorkspaceTreeControls({
      items: allItems,
      folders,
      onMoveToFolder,
      onMoveFolder,
    });
    const { searchQuery, setSearchQuery, foldersWithCount, filteredItems, isSearching } =
      treeControls;

    const renderTableList = useCallback(
      (tableItems: SavedTableSummary[], depth = 0) => (
        <div className="space-y-2">
          {tableItems.map((item) => {
            const isDraft = draftIdSet.has(item.tableId);
            const isActive = isDraft
              ? activeDraftId === item.normalizedName
              : activeTableId
                ? activeTableId === item.tableId
                : activeNormalizedName === item.normalizedName;
            return (
              <TableItem
                key={item.tableId}
                item={item}
                isActive={isActive}
                activeDirty={activeDirty}
                displayName={tablePresentations?.get(item.tableId)?.title}
                isDirty={tablePresentations?.get(item.tableId)?.isDirty}
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
        activeTableId,
        activeDraftId,
        draftIdSet,
        isSearching,
        onDelete,
        onDeleteDraft,
        onRename,
        onSelect,
        onSelectDraft,
        onViewHistory,
        tablePresentations,
      ],
    );

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
              <WorkspaceTreeView
                controls={treeControls}
                folderActions={{
                  create: onCreateFolder,
                  rename: onRenameFolder,
                  delete: onDeleteFolder,
                }}
                renderTableList={renderTableList}
                rootDropZoneTestId="root-dropzone"
                dragFeedbackTestId="saved-tables-drag-feedback"
              />
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  },
);

SavedTablesDrawer.displayName = 'SavedTablesDrawer';
