import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as Y from 'yjs';
import { savedTableReference, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { getSavedTableFromYDoc, type WorkspaceYDocChange } from '@/services/workspaceYDocAdapter';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { localSavedTableOptions } from '@/queries/workspaceLocal';
import { useWorkspaceScope } from './useWorkspaceScope';
import { useWorkspaceYDocGateway } from './useWorkspaceYDocGateway';
import { useWorkspaceYDocProjection } from './useWorkspaceYDocProjection';

const SAVED_TABLE_COLLECTIONS = ['savedTables'] as const;

export function useSavedTableRecord(target: SavedTableTarget | null) {
  const scope = useWorkspaceScope();
  const { yDoc } = useWorkspaceYDocGateway(scope);

  const { tableId, normalizedName } = target
    ? savedTableReference(target)
    : { tableId: undefined, normalizedName: '' };
  const readRecord = useCallback(
    (doc: Y.Doc, previous?: SavedTableRecord | null, change?: WorkspaceYDocChange) => {
      if (!normalizedName) return null;

      if (
        previous !== undefined &&
        change &&
        change.entityIds.size > 0 &&
        !change.entityIds.has(normalizedName) &&
        !(tableId && change.entityIds.has(tableId))
      )
        return previous;

      return getSavedTableFromYDoc(doc, { tableId, normalizedName });
    },
    [tableId, normalizedName],
  );
  const record = useWorkspaceYDocProjection(yDoc, SAVED_TABLE_COLLECTIONS, readRecord, null);

  const localQuery = useQuery({
    ...localSavedTableOptions(scope, { tableId, normalizedName }),
    enabled: !yDoc && Boolean(scope && normalizedName),
  });

  return yDoc ? record : (localQuery.data ?? null);
}
