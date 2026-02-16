import type React from 'react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { FolderTreeNode } from '@/hooks/useFolders';

export const renderFolderMenuItems = (
  folderList: FolderTreeNode[],
  currentFolderId: string | undefined,
  onMoveToFolder: ((folderId?: string) => void) | undefined,
): React.ReactNode[] => {
  return folderList.map((folder) => (
    <div key={folder.id}>
      <DropdownMenuItem
        disabled={folder.id === currentFolderId}
        onClick={() => onMoveToFolder?.(folder.id)}
      >
        <span style={{ paddingLeft: `${folder.parentId ? 12 : 0}px` }}>
          📁 {folder.name}
        </span>
      </DropdownMenuItem>
      {folder.children.length > 0 &&
        renderFolderMenuItems(folder.children, currentFolderId, onMoveToFolder)}
    </div>
  ));
};
