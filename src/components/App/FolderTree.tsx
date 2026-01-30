import { memo, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
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

interface FolderTreeProps {
  folders: FolderTreeNode[];
  expandedFolders: Set<string>;
  selectedFolderId?: string | null;
  onToggleFolder: (folderId: string) => void;
  onSelectFolder: (folderId: string | undefined) => void;
  onCreateFolder: (parentId?: string) => void;
  onRenameFolder: (folder: FolderTreeNode) => void;
  onDeleteFolder: (folder: FolderTreeNode) => void;
  renderTables: (folderId?: string) => React.ReactNode;
}

interface FolderNodeProps {
  folder: FolderTreeNode;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onCreateSubfolder: () => void;
  onRename: () => void;
  onDelete: () => void;
  children?: React.ReactNode;
}

const FolderNode = memo<FolderNodeProps>(
  ({
    folder,
    depth,
    isExpanded,
    isSelected,
    onToggle,
    onSelect,
    onCreateSubfolder,
    onRename,
    onDelete,
    children,
  }) => {
    const hasChildren =
      folder.children.length > 0 ||
      (folder.tableCount && folder.tableCount > 0);
    const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;
    const FolderIcon = isExpanded ? FolderOpen : Folder;

    return (
      <div>
        <div
          className={cn(
            'group flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
            isSelected && 'bg-accent',
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {/* 展开/折叠按钮 */}
          <button
            type="button"
            className={cn(
              'flex h-5 w-5 items-center justify-center rounded hover:bg-accent/50',
              !hasChildren && 'invisible',
            )}
            onClick={onToggle}
            aria-label={isExpanded ? '折叠' : '展开'}
          >
            <ChevronIcon className="h-3.5 w-3.5" />
          </button>

          {/* 可点击的文件夹名称区域 */}
          <button
            type="button"
            className="flex flex-1 items-center gap-1 text-left"
            onClick={onSelect}
          >
            {/* 文件夹图标 */}
            <FolderIcon className="h-4 w-4 text-amber-500" />
            {/* 文件夹名称 */}
            <span className="flex-1 truncate font-medium">{folder.name}</span>
            {/* 表数量 */}
            {folder.tableCount !== undefined && folder.tableCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {folder.tableCount}
              </span>
            )}
          </button>

          {/* 操作菜单 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onCreateSubfolder}>
                <FolderPlus className="mr-2 h-4 w-4" />
                新建子文件夹
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="mr-2 h-4 w-4" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* 子内容（展开时显示） */}
        {isExpanded && children}
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
    onToggleFolder,
    onSelectFolder,
    onCreateFolder,
    onRenameFolder,
    onDeleteFolder,
    renderTables,
  }) => {
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
            isExpanded={isExpanded}
            isSelected={isSelected}
            onToggle={() => onToggleFolder(folder.id)}
            onSelect={() => onSelectFolder(folder.id)}
            onCreateSubfolder={() => onCreateFolder(folder.id)}
            onRename={() => onRenameFolder(folder)}
            onDelete={() => onDeleteFolder(folder)}
          >
            {/* 子文件夹 */}
            {folder.children.map((child) => renderFolder(child, depth + 1))}
            {/* 该文件夹下的表 */}
            {renderTables(folder.id)}
          </FolderNode>
        );
      },
      [
        expandedFolders,
        selectedFolderId,
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
        {/* 根级文件夹 */}
        {folders.map((folder) => renderFolder(folder, 0))}

        {/* 未分组的表 */}
        {renderTables(undefined)}
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
