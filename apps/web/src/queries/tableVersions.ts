import { queryOptions, skipToken } from '@tanstack/react-query';
import { listVersions, type TableVersionTarget } from '@/utils/tableVersions';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

export const tableVersionsOptions = (target: TableVersionTarget | null) =>
  queryOptions({
    queryKey: [
      'table-versions',
      target ? getWorkspaceScopeStorageKey(target.scope) : null,
      target?.tableId,
    ],
    queryFn: target ? () => listVersions(target) : skipToken,
  });
