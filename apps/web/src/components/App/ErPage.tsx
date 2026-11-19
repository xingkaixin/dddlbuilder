import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { lazy, Suspense, useCallback, useReducer } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const ErDiagramCanvas = lazy(() =>
  import('./er-diagram/ErDiagramCanvas').then((m) => ({ default: m.ErDiagramCanvas })),
);

export interface ErPageProps {
  ready: boolean;
  scopeKey: string;
  onSelectTable: (record: SavedTableRecord) => Promise<boolean>;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: SavedTableTarget,
    state: SavedTableStateUpdate,
  ) => Promise<SaveTableResult>;
  loadTables: () => Promise<SavedTableRecord[]>;
}

const EMPTY_TABLES: SavedTableRecord[] = [];

type AddTableDialogState = {
  afterSave: (() => void) | null;
  name: string;
  submitting: boolean;
};

type AddTableDialogEvent =
  | { type: 'opened'; afterSave: () => void }
  | { type: 'closed' }
  | { type: 'nameChanged'; name: string }
  | { type: 'submitStarted' }
  | { type: 'submitSettled'; keepOpen?: boolean };

const INITIAL_ADD_DIALOG: AddTableDialogState = {
  afterSave: null,
  name: '',
  submitting: false,
};

function addTableDialogReducer(
  state: AddTableDialogState,
  event: AddTableDialogEvent,
): AddTableDialogState {
  switch (event.type) {
    case 'opened':
      return { afterSave: event.afterSave, name: '', submitting: false };
    case 'closed':
      return state.submitting ? state : INITIAL_ADD_DIALOG;
    case 'nameChanged':
      return { ...state, name: event.name };
    case 'submitStarted':
      return { ...state, submitting: true };
    case 'submitSettled':
      return event.keepOpen ? { ...state, submitting: false } : INITIAL_ADD_DIALOG;
  }
}

export function ErPage({
  ready,
  scopeKey,
  onSelectTable,
  saveTable,
  overwriteTable,
  loadTables,
}: ErPageProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [addDialog, dispatchAddDialog] = useReducer(addTableDialogReducer, INITIAL_ADD_DIALOG);

  const {
    data: tables = EMPTY_TABLES,
    isLoading: loading,
    refetch,
  } = useQuery({
    ...erDiagramTablesOptions(scopeKey, loadTables),
    enabled: ready,
  });

  const refresh = useCallback(async () => {
    await refetch({ throwOnError: true });
  }, [refetch]);

  const handleSelectTable = useCallback(
    async (record: SavedTableRecord) => {
      if (await onSelectTable(record)) pushPathname('/');
    },
    [onSelectTable],
  );

  const handleOpenAddTable = useCallback((afterSave: () => void) => {
    dispatchAddDialog({ type: 'opened', afterSave });
  }, []);

  const handleConfirmAddTable = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const trimmed = addDialog.name.trim();

      if (!trimmed || addDialog.submitting) return;

      dispatchAddDialog({ type: 'submitStarted' });
      const { defaultDatabase, sqlFormatMode } = usePreferencesStore.getState();

      const state: PersistedState = {
        schemaName: '',
        tableName: trimmed,
        tableComment: '',
        dbType: defaultDatabase,
        sqlFormatMode,
        rows: Array.from({ length: 4 }, () => createEmptyRow()),
        addCount: 4,
        indexes: [],
        authInput: '',
        authObjects: [],
      };

      try {
        const result = await saveTable(trimmed, state);

        if (!result.ok) {
          showToast(
            result.reason === 'duplicate'
              ? t('erDiagram.toast.tableDuplicate')
              : result.message || t('erDiagram.toast.tableSaveFailed'),
          );
          dispatchAddDialog({ type: 'submitSettled', keepOpen: true });

          return;
        }
      } catch {
        showToast(t('erDiagram.toast.tableSaveFailed'));
        dispatchAddDialog({ type: 'submitSettled', keepOpen: true });

        return;
      }

      dispatchAddDialog({ type: 'submitSettled' });

      try {
        await refresh();
        addDialog.afterSave?.();
        showToast(t('erDiagram.toast.tableSaved'));
      } catch {
        showToast(t('erDiagram.toast.refreshAfterSaveFailed'));
      }
    },
    [addDialog, refresh, saveTable, showToast, t],
  );

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
          scopeKey={scopeKey}
          tables={tables}
          loading={loading}
          onSelectTable={handleSelectTable}
          onRefresh={refresh}
          onAddTable={handleOpenAddTable}
          onUpdateTable={overwriteTable}
        />
      </Suspense>
      <Dialog
        open={addDialog.afterSave !== null}
        onOpenChange={(open) => {
          if (!open) dispatchAddDialog({ type: 'closed' });
        }}
      >
        <DialogContent className="sm:max-w-md">
          <form onSubmit={(event) => void handleConfirmAddTable(event)}>
            <DialogHeader>
              <DialogTitle>{t('erDiagram.toolbar.addTable')}</DialogTitle>
              <DialogDescription>{t('erDiagram.addTablePrompt')}</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                autoFocus
                value={addDialog.name}
                onChange={(event) =>
                  dispatchAddDialog({ type: 'nameChanged', name: event.target.value })
                }
                placeholder={t('tableConfig.tableNamePlaceholder')}
                disabled={addDialog.submitting}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={addDialog.submitting}
                onClick={() => dispatchAddDialog({ type: 'closed' })}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!addDialog.name.trim() || addDialog.submitting}>
                {t('erDiagram.toolbar.addTable')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
