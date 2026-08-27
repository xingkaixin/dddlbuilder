import { memo, useCallback, type ReactNode } from 'react';
import { DndContext, useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import type { FolderTreeNode } from '@/hooks/useFolders';
import type { SavedTableSummary } from '@/hooks/useSavedTables';
import { cn } from '@/lib/utils';
import { FolderTree } from '../FolderTree';
import { ROOT_DROP_ID } from './dnd';
import type { useWorkspaceTreeControls } from './useWorkspaceTreeControls';

type FolderActions = {
  create?: (parentId?: string) => void;
  rename?: (folder: FolderTreeNode) => void;
  delete?: (folder: FolderTreeNode) => void;
};

interface WorkspaceTreeViewProps {
  controls: ReturnType<typeof useWorkspaceTreeControls>;
  folderActions: FolderActions;
  renderTableList: (items: SavedTableSummary[]) => ReactNode;
  className?: string;
}

const RootDropZone = memo<{ disabled: boolean }>(({ disabled }) => {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID, disabled });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'mb-3 rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium transition-colors',
        disabled && 'border-border/70 bg-muted/20 text-muted-foreground/70',
        !disabled && isOver && 'border-primary bg-primary/10 text-primary',
        !disabled && !isOver && 'border-border/80 bg-muted/20 text-muted-foreground',
      )}
      aria-disabled={disabled}
      data-drag-over={isOver ? 'true' : 'false'}
      data-testid="root-dropzone"
    >
      {t('savedTables.rootDropzone')}
    </div>
  );
});
RootDropZone.displayName = 'RootDropZone';

export function WorkspaceTreeView({
  controls,
  folderActions,
  renderTableList,
  className,
}: WorkspaceTreeViewProps) {
  const {
    sensors,
    handleDragEnd,
    isSearching,
    dragFeedback,
    filteredItems,
    foldersWithCount,
    expandedFolders,
    selectedFolderId,
    toggleFolder,
    setSelectedFolderId,
    itemsByFolder,
    ungroupedItems,
  } = controls;
  const { create, rename, delete: remove } = folderActions;
  const canManageFolders = create && rename && remove;
  const renderTables = useCallback(
    (folderId?: string, depth = 0) => {
      const folderItems = folderId ? (itemsByFolder.get(folderId) ?? []) : ungroupedItems;
      if (folderItems.length === 0 || isSearching) return null;
      if (!folderId) return renderTableList(folderItems);
      return (
        <div style={{ marginLeft: `${(depth + 1) * 16}px` }}>{renderTableList(folderItems)}</div>
      );
    },
    [isSearching, itemsByFolder, renderTableList, ungroupedItems],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <RootDropZone disabled={isSearching} />
      {dragFeedback && (
        <div
          role={dragFeedback.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'mb-3 rounded-md border px-2.5 py-2 text-xs',
            dragFeedback.type === 'success' &&
              'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
            dragFeedback.type === 'blocked' &&
              'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
            dragFeedback.type === 'error' &&
              'border-destructive/30 bg-destructive/10 text-destructive',
          )}
          data-testid="saved-tables-drag-feedback"
        >
          {dragFeedback.message}
        </div>
      )}
      <div className={className}>
        {isSearching ? (
          renderTableList(filteredItems)
        ) : foldersWithCount.length > 0 && canManageFolders ? (
          <FolderTree
            folders={foldersWithCount}
            expandedFolders={expandedFolders}
            selectedFolderId={selectedFolderId}
            dragDisabled={isSearching}
            onToggleFolder={toggleFolder}
            onSelectFolder={setSelectedFolderId}
            onCreateFolder={create}
            onRenameFolder={rename}
            onDeleteFolder={remove}
            renderTables={renderTables}
          />
        ) : (
          renderTableList(filteredItems)
        )}
      </div>
    </DndContext>
  );
}
