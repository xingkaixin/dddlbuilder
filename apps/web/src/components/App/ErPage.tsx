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
  onSelectTable: (record: SavedTableRecord) => void;
  saveTable: (name: string, state: PersistedState) => Promise<SaveTableResult>;
  overwriteTable: (
    normalizedName: SavedTableTarget,
    state: SavedTableStateUpdate,
  ) => Promise<SaveTableResult>;
  loadTables: () => Promise<SavedTableRecord[]>;
}

const EMPTY_TABLES: SavedTableRecord[] = [];

type AddTableDialogState = {
  open: boolean;
  name: string;
  submitting: boolean;
};

type AddTableDialogEvent =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'nameChanged'; name: string }
  | { type: 'submitStarted' }
  | { type: 'submitSettled'; keepOpen?: boolean };

const INITIAL_ADD_DIALOG: AddTableDialogState = {
  open: false,
  name: '',
  submitting: false,
};

function addTableDialogReducer(
  state: AddTableDialogState,
  event: AddTableDialogEvent,
): AddTableDialogState {
  switch (event.type) {
    case 'opened':
      return { open: true, name: '', submitting: false };
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
    ...erDiagramTablesOptions(loadTables),
    enabled: ready,
  });

  const refresh = useCallback(async () => {
    await refetch({ throwOnError: true });
  }, [refetch]);

  const handleSelectTable = useCallback(
    (record: SavedTableRecord) => {
      onSelectTable(record);
      pushPathname('/');
    },
    [onSelectTable],
  );

  const handleOpenAddTable = useCallback(() => {
    dispatchAddDialog({ type: 'opened' });

    return Promise.resolve(false);
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

      const result = await saveTable(trimmed, state);

      if (result.ok) {
        showToast(t('erDiagram.toast.tableSaved'));
        await refresh();
        dispatchAddDialog({ type: 'submitSettled' });

        return;
      }

      if (result.reason === 'duplicate') {
        showToast(t('erDiagram.toast.tableDuplicate'));
      } else {
        showToast(result.message || t('erDiagram.toast.tableSaveFailed'));
      }

      dispatchAddDialog({ type: 'submitSettled', keepOpen: true });
    },
    [addDialog.name, addDialog.submitting, refresh, saveTable, showToast, t],
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
          tables={tables}
          loading={loading}
          onSelectTable={handleSelectTable}
          onRefresh={refresh}
          onAddTable={handleOpenAddTable}
          onUpdateTable={overwriteTable}
        />
      </Suspense>
      <Dialog
        open={addDialog.open}
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
