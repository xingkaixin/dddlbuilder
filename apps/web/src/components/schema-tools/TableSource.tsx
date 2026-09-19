import { Database, RefreshCw, Table2 } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { StandardSummary } from '@ddlbuilder/shared-types/api';
import { SnapshotFileInput } from './SnapshotFileInput';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PersistedState, DatabaseType } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { useSavedTablePersistence } from '@/hooks/workspacePersistence/useSavedTablePersistence';
import { DATABASE_OPTIONS } from '@/components/App/databaseOptions';
import { SqlSnapshotInput } from './SqlSnapshotInput';
import { parseSqlSnapshot } from './sqlSnapshot';

export function TableSource({
  value,
  onChange,
  onStandardsChange,
}: {
  value: PersistedState[];
  onChange: (tables: PersistedState[]) => void;
  onStandardsChange?: (standards: StandardSummary[]) => void;
}) {
  const { t } = useTranslation();
  const { scope, storage, readAllTables } = useSavedTablePersistence();
  const [source, setSource] = useState('saved');
  const [sql, setSql] = useState('');
  const [dbType, setDbType] = useState<DatabaseType>('mysql');
  const [parsed, setParsed] = useState<PersistedState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const saved = useQuery({
    queryKey: ['schema-tools-tables', scope, storage.kind],
    queryFn: async () => (await readAllTables()).active.map((record) => record.state),
    enabled: storage.kind !== 'loading',
    refetchOnWindowFocus: false,
  });
  const tables = source === 'saved' ? (saved.data ?? []) : parsed;

  const resetSql = (text: string) => {
    setSql(text);
    setParsed([]);
    setError('');
    onChange([]);
  };

  return (
    <section className="space-y-4">
      <label className="block space-y-2 text-sm font-medium">
        <span>{t('schemaTools.source')}</span>
        <select
          aria-label={t('schemaTools.source')}
          className="h-9 w-full rounded-md border bg-background px-3"
          value={source}
          disabled={busy}
          onChange={(event) => {
            setSource(event.target.value);
            setParsed([]);
            onStandardsChange?.([]);
            setError('');
            onChange([]);
          }}
        >
          <option value="saved">{t('schemaTools.saved')}</option>
          <option value="sql">SQL</option>
          <option value="snapshot">{t('snapshot.file')}</option>
        </select>
      </label>
      {source === 'saved' ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('schemaTools.savedHint')}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2 px-2 text-xs text-muted-foreground"
            disabled={saved.isFetching || storage.kind === 'loading'}
            onClick={async () => {
              const result = await saved.refetch();

              if (result.data)
                onChange(
                  result.data.filter((table) =>
                    value.some(
                      (selected) =>
                        selected.dbType === table.dbType &&
                        selected.schemaName === table.schemaName &&
                        selected.tableName === table.tableName,
                    ),
                  ),
                );
            }}
          >
            <RefreshCw
              className={cn('size-3.5', saved.isFetching && 'motion-safe:animate-spin')}
              aria-hidden="true"
            />
            {t('schemaTools.reload')}
          </Button>
          {saved.isPending && <p role="status">{t('schemaTools.loading')}</p>}
          {saved.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t('schemaTools.loadFailed')}
            </p>
          )}
        </>
      ) : source === 'snapshot' ? (
        <SnapshotFileInput
          label={t('snapshot.file')}
          onChange={(snapshot) => {
            onStandardsChange?.(snapshot.standards);
            setParsed(snapshot.tables);
            onChange(snapshot.tables);
          }}
        />
      ) : (
        <>
          <label className="block space-y-2 text-sm">
            <span>{t('schemaTools.database')}</span>
            <select
              aria-label={t('schemaTools.database')}
              value={dbType}
              disabled={busy}
              className="h-9 w-full rounded-md border bg-background px-3"
              onChange={(event) => {
                const option = DATABASE_OPTIONS.find((item) => item.value === event.target.value);

                if (option) setDbType(option.value);
                resetSql(sql);
              }}
            >
              {DATABASE_OPTIONS.filter(
                (option) => option.value !== 'hive' && option.value !== 'sqlite',
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <SqlSnapshotInput
            label={t('schemaTools.sql')}
            value={sql}
            onChange={resetSql}
            disabled={busy}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('schemaTools.parseHint')}
          </p>
          <Button
            disabled={busy || !sql.trim()}
            onClick={async () => {
              setBusy(true);
              setError('');
              onChange([]);

              try {
                const result = await parseSqlSnapshot(sql, dbType);
                setParsed(result);
                onChange(result);
              } catch (cause) {
                setParsed([]);
                setError(cause instanceof Error ? cause.message : t('schemaTools.failed'));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(busy ? 'schemaTools.loading' : 'schemaTools.parse')}
          </Button>
        </>
      )}
      {error && (
        <p
          role="alert"
          className="max-h-52 overflow-auto whitespace-pre-wrap break-words text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {tables.length > 0 ? (
        <fieldset className="min-w-0 space-y-3 border-t pt-3">
          <legend className="pr-2 text-xs font-semibold">
            {t('schemaTools.selection', { count: value.length })}
          </legend>
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => onChange(tables)}
            >
              {t('schemaTools.all')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={() => onChange([])}
            >
              {t('schemaTools.none')}
            </Button>
          </div>
          <div className="max-h-80 space-y-1 overflow-auto">
            {tables.map((table, index) => (
              <label
                key={index}
                className={cn(
                  'flex cursor-pointer items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-3 text-sm transition-colors hover:bg-muted',
                  value.includes(table) && 'border-primary/15 bg-primary/5',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                  checked={value.includes(table)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, table]
                        : value.filter((selected) => selected !== table),
                    )
                  }
                />
                <span className="min-w-0 flex-1 break-words font-mono text-xs font-medium leading-5">
                  <Table2
                    className="mr-1.5 inline size-3.5 align-text-bottom text-muted-foreground"
                    aria-hidden="true"
                  />
                  {[table.schemaName, table.tableName].filter(Boolean).join('.')}
                  <span className="mt-1 block font-sans text-xs font-normal leading-relaxed text-muted-foreground">
                    {table.tableComment || table.dbType}
                    {' · '}
                    {t('schemaTools.fieldCount', {
                      count: table.rows.filter((row) => row.fieldName.trim()).length,
                    })}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        source === 'saved' &&
        saved.isSuccess && (
          <div className="rounded-lg border border-dashed px-3 py-5 text-center">
            <Database className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t('schemaTools.emptySaved')}
            </p>
          </div>
        )
      )}
    </section>
  );
}
