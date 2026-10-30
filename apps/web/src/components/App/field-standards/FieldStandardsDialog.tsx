import { useMemo, useReducer, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { type FieldRow } from '@ddlbuilder/shared-types';
import { getSqlIdentifierKey } from '@ddlbuilder/ddl-core';
import { useEditorStore } from '@/stores';
import { useSavedTables } from '@/hooks/useSavedTables';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createEmptyRow } from '@/utils/helpers';
import { downloadFile } from '@/utils/mockDataGenerator';
import {
  applyFieldStandard,
  createFieldStandard,
  decodeFieldStandards,
  deleteFieldStandard,
  fieldStandardDifferences,
  listFieldStandards,
  saveFieldStandards,
  type FieldStandard,
  type StandardField,
} from '@/utils/fieldStandards';
import type { SavedTableRecord } from '@/utils/workspaceStorageTypes';
import { FieldStandardEditor } from './FieldStandardEditor';

const queryKey = ['field-standards'] as const;
const EMPTY_STANDARDS: FieldStandard[] = [];
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

function getStandardFieldKeys(field: StandardField): (keyof StandardField)[] {
  // SAFETY: StandardField is the owner type of every key returned by Object.keys here.
  return Object.keys(field) as (keyof StandardField)[];
}

type WorkspaceScope = ReturnType<typeof useWorkspaceScope>;

type StandardsState = {
  search: string;
  selectedId: string;
  fieldId: string;
  editing: FieldStandard | null;
  operation: 'idle' | 'running' | 'failed';
  pendingImport: FieldStandard[] | null;
  scan: { scope: WorkspaceScope; tables: SavedTableRecord[] } | null;
};

type StandardsEvent =
  | { type: 'searchChanged'; search: string }
  | { type: 'standardSelected'; id: string }
  | { type: 'fieldTargeted'; fieldId: string }
  | { type: 'referenceInspected'; standardId: string; fieldId: string }
  | { type: 'editorOpened'; standard: FieldStandard }
  | { type: 'editorClosed' }
  | { type: 'operationStarted' }
  | { type: 'operationSucceeded' }
  | { type: 'operationFailed' }
  | { type: 'standardSaved'; id: string }
  | { type: 'standardDeleted' }
  | { type: 'importCleared' }
  | { type: 'importDecoded'; standards: FieldStandard[] }
  | { type: 'tablesScanned'; scope: WorkspaceScope; tables: SavedTableRecord[] };

const initialStandardsState: StandardsState = {
  search: '',
  selectedId: '',
  fieldId: '',
  editing: null,
  operation: 'idle',
  pendingImport: null,
  scan: null,
};

function standardsReducer(state: StandardsState, event: StandardsEvent): StandardsState {
  switch (event.type) {
    case 'searchChanged':
      return { ...state, search: event.search };
    case 'standardSelected':
      return { ...state, selectedId: event.id };
    case 'fieldTargeted':
      return { ...state, fieldId: event.fieldId };
    case 'referenceInspected':
      return { ...state, selectedId: event.standardId, fieldId: event.fieldId };
    case 'editorOpened':
      return { ...state, editing: event.standard };
    case 'editorClosed':
      return { ...state, editing: null };
    case 'operationStarted':
      return { ...state, operation: 'running' };
    case 'operationSucceeded':
      return { ...state, operation: 'idle' };
    case 'operationFailed':
      return { ...state, operation: 'failed' };
    case 'standardSaved':
      return { ...state, selectedId: event.id, editing: null };
    case 'standardDeleted':
      return { ...state, selectedId: '' };
    case 'importCleared':
      return { ...state, pendingImport: null };
    case 'importDecoded':
      return { ...state, pendingImport: event.standards };
    case 'tablesScanned':
      return { ...state, scan: { scope: event.scope, tables: event.tables } };
  }
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- displayValue is a UI boundary for arbitrary JSON field values.
function displayValue(value: unknown): string {
  if (value === undefined || value === '') return '—';

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- JSON display needs to preserve primitive strings without serialization.
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '—');
}

export function FieldStandardsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const rows = useEditorStore((state) => state.rows);
  const setRows = useEditorStore((state) => state.setRows);
  const dbType = useEditorStore((state) => state.dbType);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey, queryFn: listFieldStandards });
  const standards = query.data ?? EMPTY_STANDARDS;
  const { loadTables } = useSavedTables();
  const scope = useWorkspaceScope();

  const [{ search, selectedId, fieldId, editing, operation, pendingImport, scan }, dispatch] =
    useReducer(standardsReducer, initialStandardsState);
  const busy = operation === 'running';
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = standards.find((standard) => standard.id === selectedId);
  const target = rows.find((row) => row.id === fieldId);
  const differences = selected && target ? fieldStandardDifferences(target, selected) : [];

  const byId = useMemo(
    () => new Map(standards.map((standard) => [standard.id, standard])),
    [standards],
  );
  const filtered = standards.filter((standard) =>
    `${standard.name} ${standard.description} ${standard.unit} ${standard.field.fieldName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const nameConflict =
    selected &&
    rows.some(
      (row) =>
        row.id !== target?.id &&
        getSqlIdentifierKey(row.fieldName, dbType) ===
          getSqlIdentifierKey(selected.field.fieldName, dbType),
    );
  const scanMatches = useMemo(() => {
    if (!scan || JSON.stringify(scan.scope) !== JSON.stringify(scope)) return null;
    const byName = new Map<string, FieldStandard[]>();

    for (const standard of standards) {
      const matches = byName.get(standard.field.fieldName) ?? [];
      matches.push(standard);
      byName.set(standard.field.fieldName, matches);
    }

    return scan.tables.flatMap((table) =>
      table.state.rows.flatMap((row) => {
        const candidates = row.standardId
          ? [byId.get(row.standardId)]
          : (byName.get(row.fieldName) ?? []);

        return candidates.flatMap<{
          table: string;
          row: FieldRow;
          standard: FieldStandard | undefined;
          differences: (keyof StandardField)[];
        }>((standard) => {
          if (!standard)
            return row.standardId ? [{ table: table.name, row, standard, differences: [] }] : [];

          return [
            {
              table: table.name,
              row,
              standard,
              differences: fieldStandardDifferences(row, standard),
            },
          ];
        });
      }),
    );
  }, [scan, scope, byId, standards]);

  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    dispatch({ type: 'operationStarted' });

    try {
      await task();
      dispatch({ type: 'operationSucceeded' });
    } catch {
      dispatch({ type: 'operationFailed' });
    }
  };
  const save = (standard: FieldStandard) =>
    run(async () => {
      await saveFieldStandards([standard]);
      await queryClient.invalidateQueries({ queryKey });
      dispatch({ type: 'standardSaved', id: standard.id });
    });
  const apply = () => {
    if (!selected || !target || nameConflict) return;
    setRows((current) =>
      current.map((row) => (row.id === target.id ? applyFieldStandard(row, selected) : row)),
    );
  };
  const detach = (id: string) =>
    setRows((current) =>
      current.map((row) => {
        if (row.id !== id) return row;
        const { standardId: _standardId, ...field } = row;

        return field;
      }),
    );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('fieldStandards.title')}</DialogTitle>
          <DialogDescription>{t('fieldStandards.localHint')}</DialogDescription>
        </DialogHeader>
        {(operation === 'failed' || query.isError) && (
          <p role="alert" className="text-sm text-destructive">
            {t('fieldStandards.operationFailed')}{' '}
            <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
              {t('fieldStandards.retry')}
            </Button>
          </p>
        )}
        {editing ? (
          <FieldStandardEditor
            key={editing.id}
            standard={editing}
            dbType={dbType}
            busy={busy}
            onSave={save}
            onCancel={() => dispatch({ type: 'editorClosed' })}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  dispatch({
                    type: 'editorOpened',
                    standard: createFieldStandard(target ?? createEmptyRow()),
                  })
                }
              >
                {t('fieldStandards.create')}
              </Button>
              <Button
                variant="outline"
                disabled={!standards.length}
                onClick={() =>
                  downloadFile(
                    JSON.stringify({ version: 1, standards }, null, 2),
                    'field-standards.json',
                    'application/json',
                  )
                }
              >
                {t('fieldStandards.export')}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => fileInput.current?.click()}>
                {t('fieldStandards.import')}
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                aria-label={t('fieldStandards.import')}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';

                  if (!file) return;
                  dispatch({ type: 'importCleared' });
                  void run(async () => {
                    if (file.size > 2 * 1024 * 1024) throw new Error('File too large');
                    dispatch({
                      type: 'importDecoded',
                      standards: decodeFieldStandards(JSON.parse(await file.text())),
                    });
                  });
                }}
              />
            </div>
            {pendingImport && (
              <div className="rounded-md border p-3 space-y-2">
                <p>
                  {t('fieldStandards.importPreview', {
                    count: pendingImport.length,
                    conflicts: pendingImport.filter((standard) => byId.has(standard.id)).length,
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pendingImport.map((standard) => standard.name).join(', ')}
                </p>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await saveFieldStandards(pendingImport);
                      await queryClient.invalidateQueries({ queryKey });
                      dispatch({ type: 'importCleared' });
                    })
                  }
                >
                  {t('fieldStandards.confirmImport')}
                </Button>
                <Button variant="ghost" onClick={() => dispatch({ type: 'importCleared' })}>
                  {t('fieldStandards.cancel')}
                </Button>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="space-y-2">
                <Input
                  aria-label={t('fieldStandards.search')}
                  placeholder={t('fieldStandards.search')}
                  value={search}
                  onChange={(event) =>
                    dispatch({ type: 'searchChanged', search: event.target.value })
                  }
                />
                <div className="max-h-80 overflow-y-auto space-y-1">
                  {filtered.map((standard) => (
                    <button
                      key={standard.id}
                      type="button"
                      aria-pressed={selectedId === standard.id}
                      className={`w-full rounded-md border p-3 text-left text-sm ${selectedId === standard.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'}`}
                      onClick={() => dispatch({ type: 'standardSelected', id: standard.id })}
                    >
                      <span className="block font-medium">{standard.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {standard.field.fieldName} · {standard.field.fieldType}
                      </span>
                    </button>
                  ))}
                  {!filtered.length && (
                    <p className="py-4 text-sm text-muted-foreground">
                      {t(query.isPending ? 'fieldStandards.loading' : 'fieldStandards.empty')}
                    </p>
                  )}
                </div>
              </div>
              <div className="space-y-3 min-w-0">
                <label htmlFor="standard-target" className="text-sm font-medium">
                  {t('fieldStandards.target')}
                </label>
                <select
                  id="standard-target"
                  className={selectClass}
                  value={fieldId}
                  onChange={(event) =>
                    dispatch({ type: 'fieldTargeted', fieldId: event.target.value })
                  }
                >
                  <option value="">{t('fieldStandards.selectField')}</option>
                  {rows
                    .filter((row) => row.fieldName.trim())
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.fieldName}
                      </option>
                    ))}
                </select>
                {target && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      dispatch({ type: 'editorOpened', standard: createFieldStandard(target) })
                    }
                  >
                    {t('fieldStandards.fromField')}
                  </Button>
                )}
                {selected && (
                  <>
                    <div className="rounded-md border p-3 space-y-2">
                      <h3 className="font-medium">{selected.name}</h3>
                      <p className="whitespace-pre-wrap text-sm">
                        {selected.description || t('fieldStandards.noDescription')}
                      </p>
                      <p className="text-sm">
                        {t('fieldStandards.unit')}: {selected.unit || '—'}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr>
                              <th className="text-left p-1">{t('fieldStandards.property')}</th>
                              {target && (
                                <th className="text-left p-1">{t('fieldStandards.current')}</th>
                              )}
                              <th className="text-left p-1">{t('fieldStandards.expected')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getStandardFieldKeys(selected.field).map((key) => (
                              <tr
                                key={key}
                                className={differences.includes(key) ? 'bg-amber-500/10' : ''}
                              >
                                <td className="p-1">{t(`fieldStandards.properties.${key}`)}</td>
                                {target && (
                                  <td className="p-1 break-all">{displayValue(target[key])}</td>
                                )}
                                <td className="p-1 break-all">
                                  {displayValue(selected.field[key])}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {nameConflict && (
                      <p role="alert" className="text-sm text-destructive">
                        {t('fieldStandards.nameConflict')}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!target || !!nameConflict} onClick={apply}>
                        {t('fieldStandards.apply')}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!target}
                        onClick={() =>
                          setRows((current) =>
                            current.map((row) =>
                              row.id === target?.id ? { ...row, standardId: selected.id } : row,
                            ),
                          )
                        }
                      >
                        {t('fieldStandards.linkOnly')}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={rows.some(
                          (row) =>
                            getSqlIdentifierKey(row.fieldName, dbType) ===
                            getSqlIdentifierKey(selected.field.fieldName, dbType),
                        )}
                        onClick={() => {
                          const row = applyFieldStandard(createEmptyRow(), selected);
                          setRows((current) => {
                            let insertAt = current.length;

                            while (insertAt > 0 && !current[insertAt - 1].fieldName.trim())
                              insertAt -= 1;

                            return [...current.slice(0, insertAt), row, ...current.slice(insertAt)];
                          });
                          dispatch({ type: 'fieldTargeted', fieldId: row.id });
                        }}
                      >
                        {t('fieldStandards.append')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => dispatch({ type: 'editorOpened', standard: selected })}
                      >
                        {t('fieldStandards.edit')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('fieldStandards.applyHint')}</p>
                    <details className="text-sm">
                      <summary className="cursor-pointer">{t('fieldStandards.delete')}</summary>
                      <p className="my-2 text-muted-foreground">{t('fieldStandards.deleteHint')}</p>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await deleteFieldStandard(selected.id);
                            await queryClient.invalidateQueries({ queryKey });
                            dispatch({ type: 'standardDeleted' });
                          })
                        }
                      >
                        {t('fieldStandards.confirmDelete')}
                      </Button>
                    </details>
                  </>
                )}
              </div>
            </div>
            <section className="border-t pt-4 space-y-2">
              <h3 className="font-medium">{t('fieldStandards.references')}</h3>
              {!rows.some((row) => row.standardId) && (
                <p className="text-sm text-muted-foreground">{t('fieldStandards.noReferences')}</p>
              )}
              {rows
                .filter((row) => row.standardId)
                .map((row) => {
                  const standard = byId.get(row.standardId ?? '');
                  const diffs = standard ? fieldStandardDifferences(row, standard) : [];

                  return (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center gap-2 text-sm rounded-md border p-2"
                    >
                      <span className="font-mono">{row.fieldName}</span>
                      <span>{standard?.name ?? t('fieldStandards.missing')}</span>
                      <span className="text-muted-foreground">
                        {standard
                          ? diffs.length
                            ? t('fieldStandards.drift', { count: diffs.length })
                            : t('fieldStandards.matches')
                          : row.standardId}
                      </span>
                      {standard && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            dispatch({
                              type: 'referenceInspected',
                              standardId: standard.id,
                              fieldId: row.id,
                            })
                          }
                        >
                          {t('fieldStandards.inspect')}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => detach(row.id)}>
                        {t('fieldStandards.detach')}
                      </Button>
                    </div>
                  );
                })}
            </section>
            <section className="border-t pt-4 space-y-2">
              <Button
                variant="outline"
                disabled={busy || !scope}
                onClick={() =>
                  void run(async () => {
                    const tables = await loadTables();
                    dispatch({ type: 'tablesScanned', scope, tables });
                  })
                }
              >
                {t('fieldStandards.scan')}
              </Button>
              <p className="text-xs text-muted-foreground">{t('fieldStandards.scanHint')}</p>
              {scanMatches && (
                <div className="max-h-60 overflow-auto text-sm">
                  <p>{t('fieldStandards.scanCount', { count: scanMatches.length })}</p>
                  {scanMatches.map((match, index) => (
                    <div key={index} className="border-b py-2">
                      <span className="font-mono">
                        {match.table}.{match.row.fieldName}
                      </span>{' '}
                      · {match.standard?.name ?? t('fieldStandards.missing')} ·{' '}
                      {match.standard
                        ? match.differences.length
                          ? match.differences
                              .map((key) => t(`fieldStandards.properties.${key}`))
                              .join(', ')
                          : t('fieldStandards.matches')
                        : t('fieldStandards.missing')}
                      {!match.row.standardId && <span> · {t('fieldStandards.unlinked')}</span>}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
