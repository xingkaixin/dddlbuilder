import { queryOptions } from '@tanstack/react-query';
import {
  savedTableKey,
  type SavedTableTarget,
  type WorkspaceScope,
} from '@ddlbuilder/shared-types/workspace';
import {
  getSavedTable,
  listSavedTableMetadata,
  listTrashedSavedTableMetadata,
} from '@/utils/savedTablesDb';
import { buildFolderTree, listFolders } from '@/utils/tableFolders';
import i18n from '@/i18n';

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
      if (!scope) throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
      return listSavedTableMetadata(scope);
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function localSavedTableOptions(scope: WorkspaceScope | null, target: SavedTableTarget) {
  return queryOptions({
    queryKey: [...workspaceLocalQueryKeys.scope(scope), 'saved-table', savedTableKey(target)],
    queryFn: () => {
      if (!scope) throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
      return getSavedTable(target, scope);
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function localTrashedTablesOptions(scope: WorkspaceScope | null) {
  return queryOptions({
    queryKey: workspaceLocalQueryKeys.trashedTables(scope),
    queryFn: () => {
      if (!scope) throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
      return listTrashedSavedTableMetadata(scope);
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function localFoldersOptions(scope: WorkspaceScope | null) {
  return queryOptions({
    queryKey: workspaceLocalQueryKeys.folders(scope),
    queryFn: async () => {
      if (!scope) throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
      const [folders, folderTree] = await Promise.all([listFolders(scope), buildFolderTree(scope)]);
      return { folders, folderTree };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}
