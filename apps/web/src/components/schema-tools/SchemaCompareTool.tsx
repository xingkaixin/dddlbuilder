import { ToolLayout } from './ToolLayout';
import { PublishPanel } from '@/components/publications/PublishPanel';
import { Input } from '@/components/ui/input';
import { useMemo, useReducer } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { compareSchemaSnapshots, type SnapshotFieldRename } from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/utils/mockDataGenerator';
import { SqlSnapshotInput } from './SqlSnapshotInput';
import { parseSqlSnapshot } from './sqlSnapshot';
import { comparisonDetails, comparisonMarkdown } from './comparisonReport';

type CompareState = {
  dbType: 'mysql' | 'postgresql';
  beforeSql: string;
  afterSql: string;
  renames: SnapshotFieldRename[];
  reason: string;
};

type CompareEvent =
  | { type: 'dbTypeChosen'; dbType: CompareState['dbType'] }
  | { type: 'beforeSqlChanged'; sql: string }
  | { type: 'afterSqlChanged'; sql: string }
  | { type: 'compareStarted' }
  | { type: 'renameChosen'; tableKey: string; from: string; to: string }
  | { type: 'reasonChanged'; reason: string };

const initialCompareState: CompareState = {
  dbType: 'mysql',
  beforeSql: '',
  afterSql: '',
  renames: [],
  reason: '',
};

function compareReducer(state: CompareState, event: CompareEvent): CompareState {
  switch (event.type) {
    case 'dbTypeChosen':
      return { ...state, dbType: event.dbType, renames: [] };
    case 'beforeSqlChanged':
      return { ...state, beforeSql: event.sql, renames: [] };
    case 'afterSqlChanged':
      return { ...state, afterSql: event.sql, renames: [] };
    case 'compareStarted':
      return { ...state, renames: [] };
    case 'renameChosen':
      return {
        ...state,
        renames: [
          ...state.renames.filter(
            (rename) => rename.tableKey !== event.tableKey || rename.from !== event.from,
          ),
          ...(event.to ? [{ tableKey: event.tableKey, from: event.from, to: event.to }] : []),
        ],
      };
    case 'reasonChanged':
      return { ...state, reason: event.reason };
  }
}

async function parseComparedSnapshots(request: {
  beforeSql: string;
  afterSql: string;
  dbType: CompareState['dbType'];
}): Promise<{ before: PersistedState[]; after: PersistedState[] }> {
  const [before, after] = await Promise.all([
    parseSqlSnapshot(request.beforeSql, request.dbType),
    parseSqlSnapshot(request.afterSql, request.dbType),
  ]);
  compareSchemaSnapshots(before, after);

  return { before, after };
}

export function SchemaCompareTool() {
  const { t } = useTranslation();

  const [{ dbType, beforeSql, afterSql, renames, reason }, dispatch] = useReducer(
    compareReducer,
    initialCompareState,
  );

  const compare = useMutation({ mutationFn: parseComparedSnapshots });
  const snapshots = compare.data ?? null;
  const busy = compare.isPending;

  const error = !compare.error
    ? ''
    : compare.error instanceof Error
      ? compare.error.message
      : t('schemaTools.failed');

  const original = useMemo(
    () => (snapshots ? compareSchemaSnapshots(snapshots.before, snapshots.after) : null),
    [snapshots],
  );
  const comparison = useMemo(
    () => (snapshots ? compareSchemaSnapshots(snapshots.before, snapshots.after, renames) : null),
    [snapshots, renames],
  );
  const change = (event: CompareEvent) => {
    dispatch(event);
    compare.reset();
  };

  return (
    <ToolLayout title={t('schemaTools.compare.title')} description={t('schemaTools.compare.hint')}>
      <label className="flex items-center gap-3 text-sm">
        <span>{t('schemaTools.database')}</span>
        <select
          aria-label={t('schemaTools.database')}
          className="h-9 rounded-md border bg-background px-3"
          value={dbType}
          disabled={busy}
          onChange={(event) => {
            if (event.target.value === 'mysql' || event.target.value === 'postgresql')
              change({ type: 'dbTypeChosen', dbType: event.target.value });
          }}
        >
          <option value="mysql">MySQL</option>
          <option value="postgresql">PostgreSQL</option>
        </select>
      </label>
      <div className="grid gap-5 md:grid-cols-2">
        <SqlSnapshotInput
          label={t('schemaTools.compare.before')}
          value={beforeSql}
          disabled={busy}
          onChange={(sql) => change({ type: 'beforeSqlChanged', sql })}
        />
        <SqlSnapshotInput
          label={t('schemaTools.compare.after')}
          value={afterSql}
          disabled={busy}
          onChange={(sql) => change({ type: 'afterSqlChanged', sql })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('schemaTools.parseHint')} {t('schemaTools.compare.emptySide')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || (!beforeSql.trim() && !afterSql.trim())}
          onClick={() => {
            dispatch({ type: 'compareStarted' });
            compare.mutate({ beforeSql, afterSql, dbType });
          }}
        >
          {t(busy ? 'schemaTools.loading' : 'schemaTools.compare.run')}
        </Button>
        <Button
          variant="outline"
          disabled={!comparison}
          onClick={() => {
            if (comparison)
              downloadFile(
                comparisonMarkdown(comparison, t),
                'schema-comparison.md',
                'text/markdown;charset=utf-8',
              );
          }}
        >
          {t('schemaTools.compare.exportReport')}
        </Button>
        <Button
          variant="outline"
          disabled={!comparison?.sql}
          onClick={() => {
            if (comparison)
              downloadFile(comparison.sql, 'schema-migration.sql', 'text/plain;charset=utf-8');
          }}
        >
          {t('schemaTools.compare.exportSql')}
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {comparison && snapshots && (
        <section className="space-y-3">
          <label className="block space-y-2 text-sm">
            <span>{t('publication.reason')}</span>
            <Input
              value={reason}
              maxLength={4000}
              onChange={(event) => dispatch({ type: 'reasonChanged', reason: event.target.value })}
            />
          </label>
          <PublishPanel
            title={t('publication.proposal')}
            content={{
              kind: 'proposal',
              before: snapshots.before,
              after: snapshots.after,
              renames,
              reason,
            }}
          />
        </section>
      )}
      {comparison && (
        <>
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            {t('schemaTools.compare.warning')}
          </p>
          <div className="flex flex-wrap gap-4" role="status">
            {(['added', 'removed', 'modified', 'unchanged'] as const).map((status) => (
              <span key={status} className="text-sm">
                {t(`schemaTools.compare.${status}`)}{' '}
                <strong>
                  {comparison.tables.filter((table) => table.status === status).length}
                </strong>
              </span>
            ))}
          </div>
          {comparison.blockers.length > 0 && (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm"
            >
              <p>{t('schemaTools.compare.blocked')}</p>
              <ul className="list-inside list-disc">
                {comparison.blockers.map((blocker, index) => (
                  <li key={index}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
          {comparison.tables.map((table) => {
            const source = original?.tables.find((candidate) => candidate.key === table.key);
            const removed = source?.diff?.fields.filter((field) => field.type === 'remove') ?? [];
            const added = source?.diff?.fields.filter((field) => field.type === 'add') ?? [];

            return (
              <details
                key={table.key}
                className="rounded-md border p-3"
                open={table.status !== 'unchanged'}
              >
                <summary className="cursor-pointer break-words text-sm font-medium">
                  {table.name} · {t(`schemaTools.compare.${table.status}`)}
                </summary>
                {removed.length > 0 && added.length > 0 && (
                  <fieldset className="my-4 space-y-2 rounded-md bg-muted/50 p-3">
                    <legend className="text-sm">{t('schemaTools.compare.renameHint')}</legend>
                    {removed.map((field) => (
                      <label
                        key={field.fieldName}
                        className="flex flex-wrap items-center gap-3 text-sm"
                      >
                        <span>{field.fieldName}</span>
                        <select
                          aria-label={t('schemaTools.compare.renameField', {
                            name: field.fieldName,
                          })}
                          className="h-9 rounded-md border bg-background px-2"
                          value={
                            renames.find(
                              (rename) =>
                                rename.tableKey === table.key && rename.from === field.fieldName,
                            )?.to ?? ''
                          }
                          onChange={(event) =>
                            dispatch({
                              type: 'renameChosen',
                              tableKey: table.key,
                              from: field.fieldName,
                              to: event.target.value,
                            })
                          }
                        >
                          <option value="">{t('schemaTools.compare.keepRemoval')}</option>
                          {added.map((addition) => (
                            <option
                              key={addition.fieldName}
                              value={addition.fieldName}
                              disabled={renames.some(
                                (rename) =>
                                  rename.tableKey === table.key &&
                                  rename.to === addition.fieldName &&
                                  rename.from !== field.fieldName,
                              )}
                            >
                              {addition.fieldName}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                )}
                {table.diff ? (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          {['change', 'object', 'before', 'after'].map((key) => (
                            <th key={key} className="p-2" scope="col">
                              {t(`schemaTools.compare.${key}`)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {comparisonDetails(table, t).map((row, index) => (
                          <tr key={index} className="border-t">
                            {row.map((cell, column) => (
                              <td
                                key={column}
                                className="min-w-24 whitespace-pre-wrap p-2 align-top"
                              >
                                {cell || '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-muted-foreground">
                    {(table.after ?? table.before)?.rows
                      .flatMap((row) =>
                        row.fieldName.trim() ? [`${row.fieldName} ${row.fieldType}`] : [],
                      )
                      .join(', ')}
                  </p>
                )}
              </details>
            );
          })}
          {comparison.sql && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                {t('schemaTools.compare.previewSql')}
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs">
                {comparison.sql}
              </pre>
            </details>
          )}
        </>
      )}
    </ToolLayout>
  );
}
