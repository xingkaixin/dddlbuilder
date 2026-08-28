import { usePersistedState } from '@/hooks/usePersistedState';
import { useSavedTables } from '@/hooks/useSavedTables';
import { useFolders } from '@/hooks/useFolders';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceNotifications } from './useWorkspaceNotifications';
import { useMemo } from 'react';
import { isSameSavedTable } from '@ddlbuilder/shared-types/workspace';

export function useWorkspaceController() {
  const persistence = usePersistedState();
  const savedTableData = useSavedTables();
  const folderData = useFolders();
  const workspaceScope = useWorkspaceScope();

  useWorkspaceNotifications({
    shareLoadStatus: persistence.shareLoadStatus,
    hydrated: persistence.hydrated,
    isShareView: persistence.isShareView,
    persistenceFailure: persistence.persistenceFailure,
    retryPersistence: persistence.retryPersistence,
  });

  const loadedTableSource =
    persistence.activeSource.kind === 'saved_table' ? persistence.activeSource : null;
  const loadedTable = useMemo(
    () =>
      loadedTableSource
        ? (savedTableData.savedTables.find((table) => isSameSavedTable(table, loadedTableSource)) ??
          null)
        : null,
    [loadedTableSource, savedTableData.savedTables],
  );

  return {
    persistence,
    savedTableData,
    folderData,
    workspaceScope,
    loadedTableSource,
    loadedTable,
    loadedTableId: loadedTable?.tableId ?? null,
    loadedTableNormalizedName: loadedTableSource?.normalizedName ?? null,
    loadedTableName: loadedTableSource?.tableName ?? null,
    loadedTableSignature: loadedTableSource?.baseSignature ?? null,
  };
}
