import { usePersistedState } from '@/hooks/usePersistedState';
import { useSavedTables } from '@/hooks/useSavedTables';
import { useFolders } from '@/hooks/useFolders';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceNotifications } from './useWorkspaceNotifications';
import { useSavedTableRecord } from '@/hooks/useSavedTableRecord';
import { resolveSavedTableId } from '@/utils/savedTableIdentity';

export function useWorkspaceController() {
  const { status, document, drafts, savedTableDrafts } = usePersistedState();
  const tables = useSavedTables();
  const folders = useFolders();
  const scope = useWorkspaceScope();

  useWorkspaceNotifications({
    hydrated: status.hydrated,
    isShareView: status.isShareView,
    persistenceFailure: status.persistenceFailure,
    retryPersistence: status.retryPersistence,
  });

  const source = document.activeSource.kind === 'saved_table' ? document.activeSource : null;
  const record = useSavedTableRecord(source);

  return {
    persistenceStatus: status,
    document,
    drafts,
    savedTableDrafts,
    tables,
    folders,
    scope,
    loadedTable: {
      source,
      record,
      id: record ? resolveSavedTableId(record) : null,
      normalizedName: source?.normalizedName ?? null,
      name: source?.tableName ?? null,
      signature: source?.baseSignature ?? null,
    },
  };
}
