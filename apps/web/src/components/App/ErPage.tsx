import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { lazy, Suspense, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SaveTableResult } from '@/hooks/useSavedTables';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import type { SavedTableStateUpdate } from '@/utils/savedTableStateUpdate';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/hooks/useToast';
import { pushPathname } from '@/lib/pathnameStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { createEmptyRow } from '@/utils/helpers';
import { erDiagramTablesOptions } from '@/queries/erDiagram';

const ErDiagramCanvas = lazy(() =>
  import('./er-diagram/ErDiagramCanvas').then((m) => ({ default: m.ErDiagramCanvas })),
);

export interface ErPageProps {
  ready: boolean;
  onSelectTable: (state: PersistedState) => void;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: SavedTableTarget,
    state: SavedTableStateUpdate,
  ) => Promise<SaveTableResult>;
  loadTables: () => Promise<SavedTableRecord[]>;
}

const INITIAL_ROWS = Array.from({ length: 4 }, () => createEmptyRow());
const EMPTY_TABLES: SavedTableRecord[] = [];

export function ErPage({
  ready,
  onSelectTable,
  saveTable,
  overwriteTable,
  loadTables,
}: ErPageProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();

  const {
    data: tables = EMPTY_TABLES,
    isLoading: loading,
    refetch,
  } = useQuery({
    ...erDiagramTablesOptions(loadTables),
    enabled: ready,
  });

  const refresh = useCallback(async () => {
    await refetch({ throwOnError: true });
  }, [refetch]);

  const handleSelectTable = useCallback(
    (state: PersistedState) => {
      onSelectTable(state);
      pushPathname('/');
    },
    [onSelectTable],
  );

  const handleAddTable = useCallback(async () => {
    const name = window.prompt(t('erDiagram.addTablePrompt') || '请输入表名');

    if (!name?.trim()) return false;

    const trimmed = name.trim();

    const { defaultDatabase, sqlFormatMode } = usePreferencesStore.getState();

    const state: PersistedState = {
      schemaName: '',
      tableName: trimmed,
      tableComment: '',
      dbType: defaultDatabase,
      sqlFormatMode,
      rows: INITIAL_ROWS,
      addCount: 4,
      indexes: [],
      authInput: '',
      authObjects: [],
    };

    const result = await saveTable(trimmed, state);

    if (result.ok) {
      showToast(t('erDiagram.toast.tableSaved'));
      await refresh();

      return true;
    }

    if (result.reason === 'duplicate') {
      showToast(t('erDiagram.toast.tableDuplicate'));
    } else {
      showToast(result.message || t('erDiagram.toast.tableSaveFailed'));
    }

    return false;
  }, [saveTable, refresh, showToast, t]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{t('erDiagram.title')}</h1>
      <Suspense
        fallback={
          <div
            role="status"
            className="flex h-full items-center justify-center text-muted-foreground"
          >
            {t('erDiagram.loading')}
          </div>
        }
      >
        <ErDiagramCanvas
          tables={tables}
          loading={loading}
          onSelectTable={handleSelectTable}
          onRefresh={refresh}
          onAddTable={handleAddTable}
          onUpdateTable={overwriteTable}
        />
      </Suspense>
    </div>
  );
}
