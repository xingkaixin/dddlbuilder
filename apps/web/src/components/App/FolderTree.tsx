import { memo, useState, useCallback } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Trash2,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { FolderTreeNode } from '@/hooks/useFolders';
import { useTranslation } from 'react-i18next';
import { toFolderDragId } from './saved-tables/dnd';

interface FolderTreeProps {
  folders: FolderTreeNode[];
  expandedFolders: Set<string>;
  selectedFolderId?: string | null;
  dragDisabled?: boolean;
  onToggleFolder: (folderId: string) => void;
  onSelectFolder: (folderId: string | undefined) => void;
  onCreateFolder: (parentId?: string) => void;
  onRenameFolder: (folder: FolderTreeNode) => void;
  onDeleteFolder: (folder: FolderTreeNode) => void;
  renderTables: (folderId?: string, depth?: number) => React.ReactNode;
}

interface FolderNodeProps {
  folder: FolderTreeNode;
  depth: number;
  level: number;
  isExpanded: boolean;
  isSelected: boolean;
  dragDisabled: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onCreateSubfolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}

const drawerInteractiveButtonClass =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50';

const FolderNode = memo<FolderNodeProps>(
  ({
    folder,
    depth,
    level,
    isExpanded,
    isSelected,
    dragDisabled,
    onToggle,
    onSelect,
    onCreateSubfolder,
    onRename,
    onDelete,
    children,
  }) => {
    const { t } = useTranslation();
    const hasChildren = folder.children.length > 0 || (folder.tableCount && folder.tableCount > 0);
    const dragId = toFolderDragId(folder.id);
    const { setNodeRef: setDropRef, isOver } = useDroppable({
      id: dragId,
      disabled: dragDisabled,
    });
    const {
      attributes,
      listeners,
      setNodeRef: setDragRef,
      transform,
      transition,
    } = useDraggable({
      id: dragId,
      disabled: dragDisabled,
    });
    const setNodeRef = useCallback(
      (node: HTMLDivElement | null) => {
        setDropRef(node);
        setDragRef(node);
      },
      [setDropRef, setDragRef],
    );
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
    const FolderIcon = isExpanded ? FolderOpen : Folder;

    return (
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-level={level}
        aria-selected={isSelected}
        tabIndex={isSelected ? 0 : -1}
      >
        <div
          ref={setNodeRef}
          className={cn(
            'group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-within:bg-accent',
            isSelected && 'bg-accent',
            isOver && !dragDisabled && 'ring-1 ring-primary bg-primary/10',
          )}
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            transform: CSS.Transform.toString(transform),
            transition,
          }}
          data-testid={`folder-row:${folder.id}`}
        >
          <button
            type="button"
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              drawerInteractiveButtonClass,
              dragDisabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
            )}
            aria-label={t('savedTables.dragFolder')}
            disabled={dragDisabled}
            {...attributes}
            {...listeners}
            data-testid={`drag-handle-folder:${folder.id}`}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {/* 展开/折叠按钮 */}
          <button
            type="button"
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              drawerInteractiveButtonClass,
              !hasChildren && 'invisible',
            )}
            onClick={onToggle}
            aria-label={
              isExpanded
                ? t('savedTables.collapseFolder', { name: folder.name })
                : t('savedTables.expandFolder', { name: folder.name })
            }
          >
            <ChevronIcon className="h-3.5 w-3.5" />
          </button>

          {/* 可点击的文件夹名称区域 */}
          <button
            type="button"
            className={cn(
              'flex flex-1 items-center gap-1 rounded-sm text-left',
              drawerInteractiveButtonClass,
            )}
            onClick={onSelect}
          >
            {/* 文件夹图标 */}
            <FolderIcon className="h-4 w-4 text-amber-500" />
            {/* 文件夹名称 */}
            <span className="flex-1 truncate font-medium">{folder.name}</span>
            {/* 表数量 */}
            {folder.tableCount !== undefined && folder.tableCount > 0 && (
              <span className="text-xs text-muted-foreground">{folder.tableCount}</span>
            )}
          </button>

          {/* 操作菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 text-muted-foreground opacity-70 transition-opacity hover:text-foreground group-hover:opacity-100',
                  drawerInteractiveButtonClass,
                )}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onCreateSubfolder}>
                <FolderPlus className="mr-2 h-4 w-4" />
                {t('savedTables.createSubfolder')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="mr-2 h-4 w-4" />
                {t('savedTables.rename')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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

        {/* 子内容（展开时显示） */}
        {isExpanded && <fieldset className="m-0 min-w-0 border-0 p-0">{children}</fieldset>}
      </div>
    );
  },
);
FolderNode.displayName = 'FolderNode';

export const FolderTree = memo<FolderTreeProps>(
  ({
    folders,
    expandedFolders,
    selectedFolderId,
    dragDisabled = false,
    onToggleFolder,
    onSelectFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    renderTables,
  }) => {
    const { t } = useTranslation();
    // 递归渲染文件夹
    const renderFolder = useCallback(
      (folder: FolderTreeNode, depth: number): React.ReactNode => {
        const isExpanded = expandedFolders.has(folder.id);
        const isSelected = selectedFolderId === folder.id;

        return (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={depth}
            level={depth + 1}
            isExpanded={isExpanded}
            isSelected={isSelected}
            dragDisabled={dragDisabled}
            onToggle={() => onToggleFolder(folder.id)}
            onSelect={() => onSelectFolder(folder.id)}
            onCreateSubfolder={() => onCreateFolder(folder.id)}
            onRename={() => onRenameFolder(folder)}
            onDelete={() => onDeleteFolder(folder)}
          >
            {/* 子文件夹 */}
            {folder.children.map((child) => renderFolder(child, depth + 1))}
            {/* 该文件夹下的表 */}
            {renderTables(folder.id, depth)}
          </FolderNode>
        );
      },
      [
        expandedFolders,
        selectedFolderId,
        dragDisabled,
        onToggleFolder,
        onSelectFolder,
        onCreateFolder,
        onRenameFolder,
        onDeleteFolder,
        renderTables,
      ],
    );

    return (
      <div className="space-y-0.5">
        {folders.length > 0 && (
          <div role="tree" aria-label={t('savedTables.folderTreeAria')} className="space-y-0.5">
            {/* 根级文件夹 */}
            {folders.map((folder) => renderFolder(folder, 0))}
          </div>
        )}

        {/* 未分组的表 */}
        {renderTables(undefined, 0)}
      </div>
    );
  },
);
FolderTree.displayName = 'FolderTree';

// 用于管理展开状态的 hook
export function useFolderExpansion(initialExpanded: string[] = []) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(initialExpanded),
  );

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const expandFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => new Set([...prev, folderId]));
  }, []);

  const collapseFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.delete(folderId);
      return next;
    });
  }, []);

  const expandAll = useCallback((folderIds: string[]) => {
    setExpandedFolders(new Set(folderIds));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
  }, []);

  return {
    expandedFolders,
    toggleFolder,
    expandFolder,
    collapseFolder,
    expandAll,
    collapseAll,
  };
}
