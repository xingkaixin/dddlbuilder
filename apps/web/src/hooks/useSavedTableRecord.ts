import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type * as Y from 'yjs';
import { savedTableReference, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { getSavedTableFromYDoc } from '@/services/workspaceYDocAdapter';
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
    (doc: Y.Doc) =>
      normalizedName ? getSavedTableFromYDoc(doc, { tableId, normalizedName }) : null,
    [tableId, normalizedName],
  );
  const record = useWorkspaceYDocProjection(yDoc, SAVED_TABLE_COLLECTIONS, readRecord, null);
  const localQuery = useQuery({
    ...localSavedTableOptions(scope, { tableId, normalizedName }),
    enabled: !yDoc && Boolean(scope && normalizedName),
  });
  return yDoc ? record : (localQuery.data ?? null);
}
