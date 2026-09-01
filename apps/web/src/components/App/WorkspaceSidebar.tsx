import { memo, useCallback, useMemo, useState } from 'react';
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

interface WorkspaceSidebarProps {
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  trashedItems?: SavedTableSummary[];
  trashedDraftItems?: DraftSummary[];
  draftItems?: DraftSummary[];
  folders: FolderTreeNode[];
  activeNormalizedName?: string | null;
  activeTableId?: string;
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
    activeTableId,
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
    const treeControls = useWorkspaceTreeControls({
      items,
      folders,
      onMoveToFolder,
      onMoveFolder,
    });
    const { searchQuery, setSearchQuery, filteredItems, isSearching } = treeControls;

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
              key={item.tableId}
              item={item}
              isActive={
                activeTableId
                  ? activeTableId === item.tableId
                  : activeNormalizedName === item.normalizedName
              }
              activeDirty={activeDirty}
              displayName={tablePresentations?.get(item.tableId)?.title}
              isDirty={tablePresentations?.get(item.tableId)?.isDirty}
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
        activeTableId,
        isSearching,
        onDelete,
        onRename,
        onSelect,
        onViewHistory,
        tablePresentations,
      ],
    );

    const totalTrashedCount = trashedItems.length + trashedDraftItems.length;

    return (
      <aside
        className="relative flex min-h-[calc(100dvh-7.5rem)] w-full shrink-0 flex-col overflow-hidden border-r bg-card/80 sm:min-h-0 sm:w-72"
        data-testid="workspace-sidebar"
      >
        <div className="workspace-sidebar-atmosphere" aria-hidden />

        <div className="relative flex items-center justify-between border-b px-3 py-3">
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

        <div className="relative min-h-0 flex-1 overflow-y-auto p-3">
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
                      {trashedItems.map((item) => (
                        <TrashRow
                          key={item.tableId}
                          name={item.name}
                          onRestore={onRestore ? () => onRestore(item) : undefined}
                          onDeletePermanently={
                            onDeletePermanently ? () => onDeletePermanently(item) : undefined
                          }
                        />
                      ))}
                      {trashedDraftItems.map((draft) => (
                        <TrashRow
                          key={draft.draftId}
                          name={draft.name}
                          onRestore={
                            onRestoreDraft ? () => onRestoreDraft(draft.draftId) : undefined
                          }
                          onDeletePermanently={
                            onDeleteDraftPermanently
                              ? () => onDeleteDraftPermanently(draft.draftId)
                              : undefined
                          }
                        />
                      ))}
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
                    <WorkspaceTreeView
                      controls={treeControls}
                      folderActions={{
                        create: onCreateFolder,
                        rename: onRenameFolder,
                        delete: onDeleteFolder,
                      }}
                      renderTableList={renderTableList}
                      rootDropZoneTestId="workspace-root-dropzone"
                      dragFeedbackTestId="workspace-drag-feedback"
                    />
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

function TrashRow({
  name,
  onRestore,
  onDeletePermanently,
}: {
  name: string;
  onRestore?: () => void;
  onDeletePermanently?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent">
      <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-36">
          {onRestore && (
            <DropdownMenuItem onClick={onRestore}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('savedTables.restore')}
            </DropdownMenuItem>
          )}
          {onDeletePermanently && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={onDeletePermanently}
            >
              <X className="mr-2 h-4 w-4" />
              {t('savedTables.deletePermanently')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
