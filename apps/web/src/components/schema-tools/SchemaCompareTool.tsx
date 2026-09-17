import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { compareSchemaSnapshots, type SnapshotFieldRename } from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/utils/mockDataGenerator';
import { SqlSnapshotInput } from './SqlSnapshotInput';
import { parseSqlSnapshot } from './sqlSnapshot';
import { comparisonDetails, comparisonMarkdown } from './comparisonReport';

export function SchemaCompareTool() {
  const { t } = useTranslation();
  const [dbType, setDbType] = useState<'mysql' | 'postgresql'>('mysql');
  const [beforeSql, setBeforeSql] = useState('');
  const [afterSql, setAfterSql] = useState('');

  const [snapshots, setSnapshots] = useState<{
    before: PersistedState[];
    after: PersistedState[];
  } | null>(null);
  const [renames, setRenames] = useState<SnapshotFieldRename[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const original = useMemo(
    () => (snapshots ? compareSchemaSnapshots(snapshots.before, snapshots.after) : null),
    [snapshots],
  );
  const comparison = useMemo(
    () => (snapshots ? compareSchemaSnapshots(snapshots.before, snapshots.after, renames) : null),
    [snapshots, renames],
  );
  const clear = () => {
    setSnapshots(null);
    setRenames([]);
    setError('');
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t('schemaTools.compare.hint')}</p>
      <label className="flex items-center gap-3 text-sm">
        <span>{t('schemaTools.database')}</span>
        <select
          aria-label={t('schemaTools.database')}
          className="h-9 rounded-md border bg-background px-3"
          value={dbType}
          disabled={busy}
          onChange={(event) => {
            if (event.target.value === 'mysql' || event.target.value === 'postgresql')
              setDbType(event.target.value);
            clear();
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
          onChange={(sql) => {
            clear();
            setBeforeSql(sql);
          }}
        />
        <SqlSnapshotInput
          label={t('schemaTools.compare.after')}
          value={afterSql}
          disabled={busy}
          onChange={(sql) => {
            clear();
            setAfterSql(sql);
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('schemaTools.parseHint')} {t('schemaTools.compare.emptySide')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || (!beforeSql.trim() && !afterSql.trim())}
          onClick={async () => {
            clear();
            setBusy(true);

            try {
              const [before, after] = await Promise.all([
                parseSqlSnapshot(beforeSql, dbType),
                parseSqlSnapshot(afterSql, dbType),
              ]);
              compareSchemaSnapshots(before, after);
              setSnapshots({ before, after });
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : t('schemaTools.failed'));
            } finally {
              setBusy(false);
            }
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
                            setRenames((current) => [
                              ...current.filter(
                                (rename) =>
                                  rename.tableKey !== table.key || rename.from !== field.fieldName,
                              ),
                              ...(event.target.value
                                ? [
                                    {
                                      tableKey: table.key,
                                      from: field.fieldName,
                                      to: event.target.value,
                                    },
                                  ]
                                : []),
                            ])
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
    </div>
  );
}
