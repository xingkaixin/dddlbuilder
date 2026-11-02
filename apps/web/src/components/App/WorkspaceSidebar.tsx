import { EmptyTile } from '@/components/ui/feature-tile';
import { Ink } from '@/components/ui/sketch';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { memo, useCallback, useMemo, useReducer } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  FileEdit,
  FileInput,
  FolderOpen,
  Plus,
  Search,
  Sparkles,
  Trash2,
  MoreHorizontal,
  RotateCcw,
  Upload,
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
  onCreateDraft: () => void;
  onOpenImport: () => void;
  onOpenAIGenerate: () => void;
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
}

const trashViewReducer = (showTrash: boolean, event: 'toggled' | 'closed') =>
  event === 'toggled' ? !showTrash : false;

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
    onCreateDraft,
    onOpenImport,
    onOpenAIGenerate,
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
  }) => {
    const { t } = useTranslation();
    const [showTrash, dispatchTrashView] = useReducer(trashViewReducer, false);

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
          {tableItems.map((item) => {
            const isActive = activeTableId
              ? activeTableId === item.tableId
              : activeNormalizedName === item.normalizedName;

            return (
              <TableItem
                key={item.tableId}
                item={item}
                isActive={isActive}
                activeDirty={isActive && activeDirty}
                displayName={tablePresentations?.get(item.tableId)?.title}
                isDirty={tablePresentations?.get(item.tableId)?.isDirty}
                depth={depth}
                onSelect={onSelect}
                onRename={onRename}
                onDelete={onDelete}
                dragDisabled={isSearching}
              />
            );
          })}
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
        tablePresentations,
      ],
    );

    const totalTrashedCount = trashedItems.length + trashedDraftItems.length;

    return (
      <aside
        className="absolute inset-y-0 left-0 z-30 flex w-62 shrink-0 flex-col overflow-hidden border-r bg-muted sm:static sm:z-auto sm:w-[220px]"
        data-testid="workspace-sidebar"
      >
        <div className="flex items-center justify-between px-3 pt-3">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onOpenWorkspace}
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="truncate">{t('savedTables.workspaceTitle')}</span>
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onCollapse}
            aria-label={t('savedTables.collapse')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 px-3 pt-2 [&>*]:flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1.5 px-3">
                <Plus className="h-4 w-4" />
                {t('savedTables.newMenu')}
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={onCreateDraft}>
                <FileEdit className="h-4 w-4" />
                {t('savedTables.createDraft')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenAIGenerate}>
                <Sparkles className="h-4 w-4" />
                {t('tableConfig.aiGenerate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenImport}>
                <FileInput className="h-4 w-4" />
                {t('header.importSql')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5 px-3"
            aria-label={t('header.importSql')}
            onClick={onOpenImport}
          >
            <Upload className="h-4 w-4" />
            {t('savedTables.import')}
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
                className="h-9 pl-8 text-sm"
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
                        'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] leading-5 hover:bg-accent',
                        isActive && 'bg-primary/10 text-primary',
                      )}
                    >
                      <FileEdit className="h-4 w-4 text-amber-600" />
                      <button
                        type="button"
                        className="min-w-0 flex-1 truncate text-left font-mono font-normal"
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
                        onClick={() => dispatchTrashView('closed')}
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
                    <EmptyTile
                      scene="trash"
                      title={t('emptyTiles.trash.title')}
                      description={t('emptyTiles.trash.description')}
                    />
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
                  {filteredItems.length === 0 &&
                    (normalizedQuery ? (
                      <EmptyTile
                        scene="search"
                        title={t('emptyTiles.search.title')}
                        description={t('emptyTiles.search.description')}
                      />
                    ) : (
                      <div className="px-2 py-2 text-xs text-muted-foreground">
                        {t('home.noTables')}
                      </div>
                    ))}
                </section>
              )}

              {items.length === 0 && <FirstStepsChecklist />}
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-2 py-2 text-[13px] leading-5 text-muted-foreground hover:bg-accent"
                onClick={() => dispatchTrashView('toggled')}
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

function FirstStepsChecklist() {
  const { t } = useTranslation();
  const dismissed = usePreferencesStore((state) => state.checklistDismissed);
  const setPreference = usePreferencesStore((state) => state.setPreference);

  if (dismissed) return null;

  return (
    <section
      aria-label={t('home.steps')}
      className="lm-sketch relative mb-2 flex flex-col gap-2 rounded-lg p-3 text-sm"
    >
      <Ink radius={8} />
      <div className="flex items-center justify-between">
        <span>{t('home.steps')}</span>
        <button
          type="button"
          aria-label={t('home.dismissSteps')}
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
          onClick={() => setPreference('checklistDismissed', true)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <ol className="flex flex-col gap-1.5 text-muted-foreground">
        {(['step1', 'step2', 'step3'] as const).map((step, index) => (
          <li key={step} className="flex items-center gap-2">
            <span className="font-mono text-xs">{index + 1}</span>
            {t(`home.${step}`)}
          </li>
        ))}
      </ol>
    </section>
  );
}

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
    <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 text-[13px] leading-5 hover:bg-accent">
      <Trash2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-normal">{name}</span>
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
