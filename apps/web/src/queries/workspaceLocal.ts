import { queryOptions } from '@tanstack/react-query';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { listSavedTableMetadata, listTrashedSavedTableMetadata } from '@/utils/savedTablesDb';
import { buildFolderTree, listFolders } from '@/utils/tableFolders';

export const workspaceLocalQueryKeys = {
  scope: (scope: WorkspaceScope | null) => ['workspace-local', scope] as const,
  savedTables: (scope: WorkspaceScope | null) =>
    ['workspace-local', scope, 'saved-tables'] as const,
  trashedTables: (scope: WorkspaceScope | null) =>
    ['workspace-local', scope, 'trashed-tables'] as const,
  folders: (scope: WorkspaceScope | null) => ['workspace-local', scope, 'folders'] as const,
};

export function localSavedTablesOptions(scope: WorkspaceScope | null) {
  return queryOptions({
    queryKey: workspaceLocalQueryKeys.savedTables(scope),
    queryFn: () => {
      if (!scope) throw new Error('工作区未就绪');
      return listSavedTableMetadata(scope);
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function localTrashedTablesOptions(scope: WorkspaceScope | null) {
  return queryOptions({
    queryKey: workspaceLocalQueryKeys.trashedTables(scope),
    queryFn: () => {
      if (!scope) throw new Error('工作区未就绪');
      return listTrashedSavedTableMetadata(scope);
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function localFoldersOptions(scope: WorkspaceScope | null) {
  return queryOptions({
    queryKey: workspaceLocalQueryKeys.folders(scope),
    queryFn: async () => {
      if (!scope) throw new Error('工作区未就绪');
      const [folders, folderTree] = await Promise.all([listFolders(scope), buildFolderTree(scope)]);
      return { folders, folderTree };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
