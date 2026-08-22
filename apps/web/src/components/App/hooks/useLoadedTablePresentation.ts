import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { countVersions } from '@/utils/tableVersions';

interface UseLoadedTablePresentationParams {
  hydrated: boolean;
  isShareView: boolean;
  normalizedName: string | null;
  tableName: string | null;
  isDirty: boolean;
}

export function useLoadedTablePresentation({
  hydrated,
  isShareView,
  normalizedName,
  tableName,
  isDirty,
}: UseLoadedTablePresentationParams) {
  const { t } = useTranslation();
  const [versionState, setVersionState] = useState({ normalizedName, value: 0 });
  const version = versionState.normalizedName === normalizedName ? versionState.value : 0;
  const setVersion = useCallback(
    (value: number, targetNormalizedName = normalizedName) =>
      setVersionState({ normalizedName: targetNormalizedName, value }),
    [normalizedName],
  );

  useEffect(() => {
    if (!hydrated || isShareView) return;
    if (!normalizedName) return;

    let cancelled = false;
    void countVersions(normalizedName)
      .then((count) => {
        if (!cancelled) setVersionState({ normalizedName, value: count > 0 ? count : 1 });
      })
      .catch(() => {
        if (!cancelled) setVersionState({ normalizedName, value: 1 });
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, isShareView, normalizedName]);

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
