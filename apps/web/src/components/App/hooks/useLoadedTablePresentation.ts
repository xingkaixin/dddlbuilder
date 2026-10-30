import { savedTableKey, type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { useTranslation } from 'react-i18next';

type LoadedVersion = { identityKey: string | null; value: number };

type LoadedVersionEvent =
  | { type: 'versionsCounted'; identityKey: string | null; count: number }
  | { type: 'versionCountFailed'; identityKey: string | null }
  | { type: 'versionSet'; identityKey: string | null; version: number };

const loadedVersionReducer = (_state: LoadedVersion, event: LoadedVersionEvent): LoadedVersion => {
  switch (event.type) {
    case 'versionsCounted':
      return { identityKey: event.identityKey, value: event.count > 0 ? event.count : 1 };
    case 'versionCountFailed':
      return { identityKey: event.identityKey, value: 1 };
    case 'versionSet':
      return { identityKey: event.identityKey, value: event.version };
  }
};

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
  const [versionState, dispatch] = useReducer(loadedVersionReducer, { identityKey, value: 0 });
  const version = versionState.identityKey === identityKey ? versionState.value : 0;

  const setVersion = useCallback(
    (value: number, target?: SavedTableTarget) =>
      dispatch({
        type: 'versionSet',
        identityKey: target ? savedTableKey(target) : identityKey,
        version: value,
      }),
    [identityKey],
  );

  useEffect(() => {
    if (!hydrated || isShareView) return;
    if (!normalizedName) return;

    let cancelled = false;
    void countTableVersions(tableId ? { normalizedName, tableId } : normalizedName)
      .then((count) => {
        if (!cancelled) dispatch({ type: 'versionsCounted', identityKey, count });
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'versionCountFailed', identityKey });
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
