import { memo, useCallback, useMemo, useState } from 'react';
import { DndContext, useDroppable } from '@dnd-kit/core';
import {
  ChevronLeft,
  FileEdit,
  FolderOpen,
  Plus,
  Search,
  Trash2,
  MoreHorizontal,
  RotateCcw,
  X,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import { useTranslation } from 'react-i18next';
import { FolderTree } from './FolderTree';
import { TableItem } from './saved-tables/TableItem';
import { ROOT_DROP_ID } from './saved-tables/dnd';
import {
  useWorkspaceTreeControls,
  type MoveOperationResult,
} from './saved-tables/useWorkspaceTreeControls';

type TablePresentation = {
  title: string;
  isDirty: boolean;
};

interface WorkspaceSidebarProps {
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  trashedItems?: SavedTableSummary[];
  trashedDraftItems?: DraftSummary[];
  draftItems?: DraftSummary[];
  folders: FolderTreeNode[];
  activeNormalizedName?: string | null;
  activeDraftId?: string | null;
  activeDirty?: boolean;
  tablePresentations?: ReadonlyMap<string, TablePresentation>;
  onCollapse: () => void;
  onOpenWorkspace: () => void;
  onCreateFolder?: () => void;
  onSelectDraft?: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
  onMoveDraftToFolder?: (draftId: string, folderId?: string) => void;
  onSelect: (item: SavedTableSummary) => void;
  onRename: (item: SavedTableSummary) => void;
  onDelete: (item: SavedTableSummary) => void;
  onRestore?: (item: SavedTableSummary) => void;
  onDeletePermanently?: (item: SavedTableSummary) => void;
  onRestoreDraft?: (draftId: string) => void;
  onDeleteDraftPermanently?: (draftId: string) => void;
  onEmptyTrash?: () => void;
  onMoveToFolder?: (
    item: SavedTableSummary,
    folderId?: string,
  ) => MoveOperationResult | Promise<MoveOperationResult | undefined> | undefined;
  onMoveFolder?: (
    folder: FolderTreeNode,
    parentId?: string,
  ) => MoveOperationResult | Promise<MoveOperationResult | undefined> | undefined;
  onRenameFolder?: (folder: FolderTreeNode) => void;
  onDeleteFolder?: (folder: FolderTreeNode) => void;
  onViewHistory?: (item: SavedTableSummary) => void;
}

const RootDropZone = memo<{ disabled: boolean }>(({ disabled }) => {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID, disabled });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mb-2 rounded-md border border-dashed px-2.5 py-1.5 text-[11px] font-medium transition-colors',
        disabled && 'border-border/70 bg-muted/20 text-muted-foreground/70',
        !disabled && isOver && 'border-primary bg-primary/10 text-primary',
        !disabled && !isOver && 'border-border/80 bg-muted/20 text-muted-foreground',
      )}
    >
      {t('savedTables.rootDropzone')}
    </div>
  );
});
RootDropZone.displayName = 'WorkspaceRootDropZone';

export const WorkspaceSidebar = memo<WorkspaceSidebarProps>(
  ({
    loading,
    error,
    items,
    trashedItems = [],
    trashedDraftItems = [],
    draftItems = [],
    folders,
    activeNormalizedName,
    activeDraftId,
    activeDirty = false,
    tablePresentations,
    onCollapse,
    onOpenWorkspace,
    onCreateFolder,
    onSelectDraft,
    onDeleteDraft,
    onMoveDraftToFolder,
    onSelect,
    onRename,
    onDelete,
    onRestore,
    onDeletePermanently,
    onRestoreDraft,
    onDeleteDraftPermanently,
    onEmptyTrash,
    onMoveToFolder,
    onMoveFolder,
    onRenameFolder,
    onDeleteFolder,
    onViewHistory,
  }) => {
    const { t } = useTranslation();
    const [showTrash, setShowTrash] = useState(false);
    const {
      searchQuery,
      setSearchQuery,
      selectedFolderId,
      setSelectedFolderId,
      expandedFolders,
      toggleFolder,
      sensors,
      foldersWithCount,
      filteredItems,
      itemsByFolder,
      ungroupedItems,
      isSearching,
      dragFeedback,
      handleDragEnd,
    } = useWorkspaceTreeControls({
      items,
      folders,
      initiallyExpandedFolderIds: folders.map((folder) => folder.id),
      onMoveToFolder,
      onMoveFolder,
    });

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const visibleDrafts = useMemo(
      () =>
        normalizedQuery
          ? draftItems.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
          : draftItems,
      [draftItems, normalizedQuery],
    );
    const flatFolders = useMemo(() => {
      const result: Array<{ id: string; name: string; depth: number }> = [];
      const walk = (nodes: FolderTreeNode[], depth: number) => {
        for (const folder of nodes) {
          result.push({ id: folder.id, name: folder.name, depth });
          walk(folder.children, depth + 1);
        }
      };
      walk(folders, 0);
      return result;
    }, [folders]);
    const renderTableList = useCallback(
      (tableItems: SavedTableSummary[], depth = 0) => (
        <div className="space-y-1">
          {tableItems.map((item) => (
            <TableItem
              key={item.normalizedName}
              item={item}
              isActive={activeNormalizedName === item.normalizedName}
              activeDirty={activeDirty}
              displayName={tablePresentations?.get(item.normalizedName)?.title}
              isDirty={tablePresentations?.get(item.normalizedName)?.isDirty}
              depth={depth}
              onSelect={() => onSelect(item)}
              onRename={() => onRename(item)}
              onDelete={() => onDelete(item)}
              onViewHistory={onViewHistory ? () => onViewHistory(item) : undefined}
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
        tablePresentations,
      ],
    );

    const renderTables = useCallback(
      (folderId?: string, depth = 0) => {
        const folderItems = folderId ? (itemsByFolder.get(folderId) ?? []) : ungroupedItems;
        if (folderItems.length === 0 || isSearching) return null;
        if (!folderId) return renderTableList(folderItems, 0);
        return (
          <div style={{ marginLeft: `${(depth + 1) * 16}px` }}>{renderTableList(folderItems)}</div>
        );
      },
      [isSearching, itemsByFolder, renderTableList, ungroupedItems],
    );

    const renderTrashTable = (item: SavedTableSummary) => (
      <div
        key={item.normalizedName}
        className="group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      >
        <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {onRestore && (
              <DropdownMenuItem onClick={() => onRestore(item)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('savedTables.restore')}
              </DropdownMenuItem>
            )}
            {onDeletePermanently && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDeletePermanently(item)}
              >
                <X className="mr-2 h-4 w-4" />
                {t('savedTables.deletePermanently')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );

    const renderTrashDraft = (draft: DraftSummary) => (
      <div
        key={draft.draftId}
        className="group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
      >
        <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-medium">{draft.name}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            {onRestoreDraft && (
              <DropdownMenuItem onClick={() => onRestoreDraft(draft.draftId)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                {t('savedTables.restore')}
              </DropdownMenuItem>
            )}
            {onDeleteDraftPermanently && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDeleteDraftPermanently(draft.draftId)}
              >
                <X className="mr-2 h-4 w-4" />
                {t('savedTables.deletePermanently')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );

    const totalTrashedCount = trashedItems.length + trashedDraftItems.length;

    return (
      <aside
        className="flex min-h-[calc(100vh-7.5rem)] w-full shrink-0 flex-col border-r bg-card/80 sm:w-72"
        data-testid="workspace-sidebar"
      >
        <div className="flex items-center justify-between border-b px-3 py-3">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2"
            onClick={onOpenWorkspace}
          >
            <FolderOpen className="h-4 w-4 text-primary" />
            <span className="truncate text-sm font-semibold">
              {t('savedTables.workspaceTitle')}
            </span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCollapse}
            aria-label={t('savedTables.collapse')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="mb-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('savedTables.workspaceSearchPlaceholder')}
                className="h-8 pl-8 text-xs"
              />
            </div>
            {onCreateFolder && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onCreateFolder()}
                aria-label={t('savedTables.createFolder')}
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>

          {loading && (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              {t('savedTables.loading')}
            </div>
          )}
          {!loading && error && <div className="px-2 py-3 text-xs text-destructive">{error}</div>}
          {!loading && !error && (
            <div className="space-y-4">
              <section className="space-y-1">
                <div className="flex items-center px-2 text-xs font-medium text-muted-foreground">
                  <span>{t('savedTables.draftsSection')}</span>
                </div>
                {visibleDrafts.map((draft) => {
                  const isActive = activeDraftId === draft.draftId;
                  return (
                    <div
                      key={draft.draftId}
                      className={cn(
                        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                        isActive && 'bg-primary/10 text-primary',
                      )}
                    >
                      <FileEdit className="h-4 w-4 text-amber-600" />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-medium"
                        onClick={() => onSelectDraft?.(draft.draftId)}
                      >
                        {draft.name}
                      </button>
                      {onDeleteDraft && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            {onMoveDraftToFolder && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <FolderOpen className="mr-2 h-4 w-4" />
                                  {t('savedTables.moveToFolder')}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-44">
                                  <DropdownMenuItem
                                    onClick={() => onMoveDraftToFolder(draft.draftId)}
                                  >
                                    {t('savedTables.moveToRoot')}
                                  </DropdownMenuItem>
                                  {flatFolders.map((folder) => (
                                    <DropdownMenuItem
                                      key={folder.id}
                                      onClick={() => onMoveDraftToFolder(draft.draftId, folder.id)}
                                      style={{ paddingLeft: `${folder.depth * 12 + 8}px` }}
                                    >
                                      {folder.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => onDeleteDraft(draft.draftId)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              {t('savedTables.deleteDraft')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  );
                })}
              </section>

              {showTrash ? (
                <section className="space-y-1">
                  <div className="flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
                    <span>{t('savedTables.trash')}</span>
                    <div className="flex items-center gap-2">
                      {onEmptyTrash && totalTrashedCount > 0 && (
                        <button type="button" className="text-destructive" onClick={onEmptyTrash}>
                          {t('savedTables.emptyTrash')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-primary"
                        onClick={() => setShowTrash(false)}
                      >
                        {t('savedTables.backToProjects')}
                      </button>
                    </div>
                  </div>
                  {totalTrashedCount > 0 ? (
                    <>
                      {trashedItems.map((item) => renderTrashTable(item))}
                      {trashedDraftItems.map((draft) => renderTrashDraft(draft))}
                    </>
                  ) : (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      {t('savedTables.trashEmpty')}
                    </div>
                  )}
                </section>
              ) : (
                <section className="space-y-1">
                  <div className="px-2 text-xs font-medium text-muted-foreground">
                    {t('savedTables.projectsSection')}
                  </div>
                  {filteredItems.length > 0 && (
                    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
                      <RootDropZone disabled={isSearching} />
                      {dragFeedback && (
                        <div
                          className={cn(
                            'mb-2 rounded-md border px-2 py-1.5 text-[11px]',
                            dragFeedback.type === 'success' &&
                              'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
                            dragFeedback.type === 'blocked' &&
                              'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
                            dragFeedback.type === 'error' &&
                              'border-destructive/30 bg-destructive/10 text-destructive',
                          )}
                        >
                          {dragFeedback.message}
                        </div>
                      )}
                      {isSearching ? (
                        renderTableList(filteredItems)
                      ) : foldersWithCount.length > 0 &&
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
                        renderTableList(filteredItems)
                      )}
                    </DndContext>
                  )}
                  {filteredItems.length === 0 && (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      {normalizedQuery ? t('savedTables.noMatch') : t('savedTables.empty')}
                    </div>
                  )}
                </section>
              )}

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent"
                onClick={() => setShowTrash((value) => !value)}
              >
                <span className="inline-flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  {t('savedTables.trash')}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {totalTrashedCount}
                </span>
              </button>
            </div>
          )}
        </div>
      </aside>
    );
  },
);

WorkspaceSidebar.displayName = 'WorkspaceSidebar';
