import { queryOptions, skipToken } from '@tanstack/react-query';
import {
  savedTableKey,
  type SavedTableTarget,
  type WorkspaceScope,
} from '@ddlbuilder/shared-types/workspace';
import { listVersions, type TableVersionTarget } from '@/utils/tableVersions';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

export const tableVersionsRootKey = ['table-versions'] as const;

export const tableVersionsOptions = (target: TableVersionTarget | null) =>
  queryOptions({
    queryKey: [
      ...tableVersionsRootKey,
      target ? getWorkspaceScopeStorageKey(target.scope) : null,
      target?.tableId,
    ],
    queryFn: target ? () => listVersions(target) : skipToken,
  });

export const tableVersionCountOptions = (
  scope: WorkspaceScope | null,
  target: SavedTableTarget | null,
  countVersions: (target: SavedTableTarget) => Promise<number>,
) =>
  queryOptions({
    queryKey: [
      ...tableVersionsRootKey,
      scope ? getWorkspaceScopeStorageKey(scope) : null,
      target ? savedTableKey(target) : null,
      'count',
    ],
    queryFn: scope && target ? () => countVersions(target) : skipToken,
  });
