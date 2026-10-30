import type { SavedTableTarget, WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { tableVersionCountOptions, tableVersionsRootKey } from '@/queries/tableVersions';

interface UseLoadedTablePresentationParams {
  hydrated: boolean;
  isShareView: boolean;
  workspaceScope: WorkspaceScope | null;
  normalizedName: string | null;
  tableId?: string | null;
  tableName: string | null;
  isDirty: boolean;
  countTableVersions: (normalizedName: SavedTableTarget) => Promise<number>;
}

export function useLoadedTablePresentation({
  hydrated,
  isShareView,
  workspaceScope,
  normalizedName,
  tableId,
  tableName,
  isDirty,
  countTableVersions,
}: UseLoadedTablePresentationParams) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const loadedTarget = normalizedName && tableId ? { normalizedName, tableId } : normalizedName;
  const target = hydrated && !isShareView ? loadedTarget : null;

  const versionCount = useQuery(
    tableVersionCountOptions(workspaceScope, target, countTableVersions),
  );
  const countedVersion = versionCount.isSuccess ? Math.max(versionCount.data, 1) : 0;
  const version = versionCount.isError ? 1 : countedVersion;

  const refreshTableVersions = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: tableVersionsRootKey }),
    [queryClient],
  );

  const label = useMemo(() => {
    if (isShareView) return t('app.workspace.shareReadonly');
    if (!tableName) return t('app.workspace.globalDraft');

    return t('app.workspace.currentTable', {
      name: tableName,
      version: version > 0 ? t('app.workspace.version', { version }) : '',
      dirty: isDirty ? t('app.workspace.dirtyMark') : '',
    });
  }, [isDirty, isShareView, t, tableName, version]);

  return { refreshTableVersions, workspaceLabel: label };
}
