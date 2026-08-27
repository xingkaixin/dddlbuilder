import { savedTableKey, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface UseLoadedTablePresentationParams {
  hydrated: boolean;
  isShareView: boolean;
  normalizedName: string | null;
  tableId?: string | null;
  tableName: string | null;
  isDirty: boolean;
  countTableVersions: (normalizedName: SavedTableTarget) => Promise<number>;
}

export function useLoadedTablePresentation({
  hydrated,
  isShareView,
  normalizedName,
  tableId,
  tableName,
  isDirty,
  countTableVersions,
}: UseLoadedTablePresentationParams) {
  const { t } = useTranslation();
  const identityKey = tableId ?? normalizedName;
  const [versionState, setVersionState] = useState({ identityKey, value: 0 });
  const version = versionState.identityKey === identityKey ? versionState.value : 0;
  const setVersion = useCallback(
    (value: number, target?: SavedTableTarget) =>
      setVersionState({ identityKey: target ? savedTableKey(target) : identityKey, value }),
    [identityKey],
  );

  useEffect(() => {
    if (!hydrated || isShareView) return;
    if (!normalizedName) return;

    let cancelled = false;
    void countTableVersions(tableId ? { normalizedName, tableId } : normalizedName)
      .then((count) => {
        if (!cancelled) setVersionState({ identityKey, value: count > 0 ? count : 1 });
      })
      .catch(() => {
        if (!cancelled) setVersionState({ identityKey, value: 1 });
      });

    return () => {
      cancelled = true;
    };
  }, [countTableVersions, hydrated, isShareView, normalizedName, tableId, identityKey]);

  const label = useMemo(() => {
    if (isShareView) return t('app.workspace.shareReadonly');
    if (!tableName) return t('app.workspace.globalDraft');
    return t('app.workspace.currentTable', {
      name: tableName,
      version: version > 0 ? t('app.workspace.version', { version }) : '',
      dirty: isDirty ? t('app.workspace.dirtyMark') : '',
    });
  }, [isDirty, isShareView, t, tableName, version]);

  return { loadedTableVersion: version, setLoadedTableVersion: setVersion, workspaceLabel: label };
}
