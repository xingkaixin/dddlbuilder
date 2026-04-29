import { memo, useMemo, useState } from 'react';
import type React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  FileEdit,
  Folder,
  FolderOpen,
  History,
  Plus,
  Search,
  Table2,
  Trash2,
  MoreHorizontal,
  RotateCcw,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import type { DraftSummary } from '@ddlbuilder/shared-types/workspace';
import { useTranslation } from 'react-i18next';

interface WorkspaceSidebarProps {
  open: boolean;
  loading: boolean;
  error?: string | null;
  items: SavedTableSummary[];
  trashedItems?: SavedTableSummary[];
  draftItems?: DraftSummary[];
  folders: FolderTreeNode[];
  activeNormalizedName?: string | null;
  activeDraftId?: string | null;
  activeDirty?: boolean;
  onToggle: () => void;
  onOpenWorkspace: () => void;
  onCreateDraft?: () => void;
  onCreateFolder?: () => void;
  onSelectDraft?: (draftId: string) => void;
  onDeleteDraft?: (draftId: string) => void;
  onMoveDraftToFolder?: (draftId: string, folderId?: string) => void;
  onSelect: (item: SavedTableSummary) => void;
  onRename: (item: SavedTableSummary) => void;
  onDelete: (item: SavedTableSummary) => void;
  onRestore?: (item: SavedTableSummary) => void;
  onDeletePermanently?: (item: SavedTableSummary) => void;
  onMoveToFolder?: (item: SavedTableSummary, folderId?: string) => void;
  onViewHistory?: (item: SavedTableSummary) => void;
}

type FolderWithTables = Omit<FolderTreeNode, 'children'> & {
  tables: SavedTableSummary[];
  children: FolderWithTables[];
};

const buildFolderTree = (folders: FolderTreeNode[], items: SavedTableSummary[]) => {
  const tableGroups = new Map<string | undefined, SavedTableSummary[]>();
  for (const item of items) {
    const group = tableGroups.get(item.folderId) ?? [];
    group.push(item);
    tableGroups.set(item.folderId, group);
  }

  const attach = (nodes: FolderTreeNode[]): FolderWithTables[] =>
    nodes.map((folder) => ({
      ...folder,
      tables: tableGroups.get(folder.id) ?? [],
      children: attach(folder.children),
    }));

  return {
    folders: attach(folders),
    rootTables: tableGroups.get(undefined) ?? [],
  };
};

export const WorkspaceSidebar = memo<WorkspaceSidebarProps>(
  ({
    open,
    loading,
    error,
    items,
    trashedItems = [],
    draftItems = [],
    folders,
    activeNormalizedName,
    activeDraftId,
    activeDirty = false,
    onToggle,
    onOpenWorkspace,
    onCreateDraft,
    onCreateFolder,
    onSelectDraft,
    onDeleteDraft,
    onMoveDraftToFolder,
    onSelect,
    onRename,
    onDelete,
    onRestore,
    onDeletePermanently,
    onMoveToFolder,
    onViewHistory,
  }) => {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [showTrash, setShowTrash] = useState(false);
    const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(
      () => new Set(folders.map((folder) => folder.id)),
    );

    const normalizedQuery = query.trim().toLowerCase();
    const visibleItems = useMemo(
      () =>
        normalizedQuery
          ? items.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
          : items,
      [items, normalizedQuery],
    );
    const visibleDrafts = useMemo(
      () =>
        normalizedQuery
          ? draftItems.filter((item) => item.name.toLowerCase().includes(normalizedQuery))
          : draftItems,
      [draftItems, normalizedQuery],
    );
    const { folders: groupedFolders, rootTables } = useMemo(
      () => buildFolderTree(folders, visibleItems),
      [folders, visibleItems],
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

    const toggleFolder = (folderId: string) => {
      setExpandedFolderIds((prev) => {
        const next = new Set(prev);
        if (next.has(folderId)) {
          next.delete(folderId);
        } else {
          next.add(folderId);
        }
        return next;
      });
    };

    const renderTable = (item: SavedTableSummary, depth = 0) => {
      const isActive = activeNormalizedName === item.normalizedName;
      return (
        <div
          key={item.normalizedName}
          className={cn(
            'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm hover:bg-accent',
            isActive && 'bg-primary/10 text-primary',
          )}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
        >
          <Table2 className="h-4 w-4 shrink-0" />
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-medium"
            onClick={() => onSelect(item)}
          >
            {item.name}
          </button>
          {isActive && activeDirty && (
            <span className="rounded bg-amber-500/10 px-1 py-0 text-[10px] text-amber-600">
              {t('savedTables.dirty')}
            </span>
          )}
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
            <DropdownMenuContent align="end" className="w-32">
              {onViewHistory && (
                <DropdownMenuItem onClick={() => onViewHistory(item)}>
                  <History className="mr-2 h-4 w-4" />
                  {t('savedTables.history')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onRename(item)}>
                {t('savedTables.rename')}
              </DropdownMenuItem>
              {onMoveToFolder && (
                <>
                  <DropdownMenuItem onClick={() => onMoveToFolder(item, undefined)}>
                    {t('savedTables.moveToRoot')}
                  </DropdownMenuItem>
                  {flatFolders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={() => onMoveToFolder(item, folder.id)}
                    >
                      <span style={{ paddingLeft: `${folder.depth * 10}px` }}>{folder.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(item)}
              >
                {t('savedTables.moveToTrash')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      );
    };

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

    const renderFolder = (folder: FolderWithTables, depth = 0): React.ReactNode => {
      const expanded = expandedFolderIds.has(folder.id);
      const FolderIcon = expanded ? FolderOpen : Folder;
      const childCount = folder.tables.length + folder.children.length;
      return (
        <div key={folder.id}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            onClick={() => toggleFolder(folder.id)}
          >
            {expanded ? (
              <ChevronRight className="h-3.5 w-3.5 rotate-90 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <FolderIcon className="h-4 w-4 text-amber-500" />
            <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
            {childCount > 0 && <span className="text-xs text-muted-foreground">{childCount}</span>}
          </button>
          {expanded && (
            <div>
              {folder.children.map((child) => renderFolder(child, depth + 1))}
              {folder.tables.map((table) => renderTable(table, depth + 1))}
            </div>
          )}
        </div>
      );
    };

    return (
      <aside
        className={cn(
          'flex min-h-[calc(100vh-7.5rem)] shrink-0 flex-col border-r bg-card/80 transition-all duration-200',
          open ? 'w-full sm:w-72' : 'w-full sm:w-14',
        )}
      >
        <div className="flex items-center justify-between border-b px-3 py-3">
          <button
            type="button"
            className={cn('flex min-w-0 items-center gap-2', open ? 'flex' : 'sm:hidden')}
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
            onClick={onToggle}
            aria-label={open ? t('savedTables.collapse') : t('savedTables.expand')}
          >
            {open ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>

        <div className={cn('min-h-0 flex-1 overflow-y-auto p-3', open ? 'block' : 'sm:hidden')}>
          <div className="mb-3 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
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
                <div className="flex items-center justify-between px-2 text-xs font-medium text-muted-foreground">
                  <span>{t('savedTables.draftsSection')}</span>
                  {onCreateDraft && (
                    <button type="button" onClick={onCreateDraft} className="text-primary">
                      {t('savedTables.createDraft')}
                    </button>
                  )}
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
                      {(onDeleteDraft || onMoveDraftToFolder) && (
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
                              <>
                                <DropdownMenuItem
                                  onClick={() => onMoveDraftToFolder(draft.draftId, undefined)}
                                >
                                  {t('savedTables.moveToRoot')}
                                </DropdownMenuItem>
                                {flatFolders.map((folder) => (
                                  <DropdownMenuItem
                                    key={folder.id}
                                    onClick={() => onMoveDraftToFolder(draft.draftId, folder.id)}
                                  >
                                    <span style={{ paddingLeft: `${folder.depth * 10}px` }}>
                                      {folder.name}
                                    </span>
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                            {onDeleteDraft && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => onDeleteDraft(draft.draftId)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('savedTables.deleteDraft')}
                              </DropdownMenuItem>
                            )}
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
                    <button
                      type="button"
                      className="text-primary"
                      onClick={() => setShowTrash(false)}
                    >
                      {t('savedTables.backToProjects')}
                    </button>
                  </div>
                  {trashedItems.length > 0 ? (
                    trashedItems.map((item) => renderTrashTable(item))
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
                  {groupedFolders.map((folder) => renderFolder(folder))}
                  {rootTables.map((table) => renderTable(table))}
                  {visibleItems.length === 0 && (
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
                  {trashedItems.length}
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
