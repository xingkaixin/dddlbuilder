import { Database, RefreshCw, Table2 } from '@/components/icons';
import { cn } from '@/lib/utils';
import type { StandardSummary } from '@ddlbuilder/shared-types/api';
import { SnapshotFileInput } from './SnapshotFileInput';
import { useReducer } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PersistedState, DatabaseType } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { useSavedTablePersistence } from '@/hooks/workspacePersistence/useSavedTablePersistence';
import { DATABASE_OPTIONS } from '@/components/App/databaseOptions';
import { SqlSnapshotInput } from './SqlSnapshotInput';
import { parseSqlSnapshot } from './sqlSnapshot';

type SourceKind = 'saved' | 'sql' | 'snapshot';

type TableSourceState = {
  source: SourceKind;
  sql: string;
  dbType: DatabaseType;
  snapshotTables: PersistedState[];
};

type TableSourceEvent =
  | { type: 'sourceChosen'; source: SourceKind }
  | { type: 'sqlChanged'; sql: string }
  | { type: 'dbTypeChosen'; dbType: DatabaseType }
  | { type: 'snapshotLoaded'; tables: PersistedState[] };

const initialTableSourceState: TableSourceState = {
  source: 'saved',
  sql: '',
  dbType: 'mysql',
  snapshotTables: [],
};

function tableSourceReducer(state: TableSourceState, event: TableSourceEvent): TableSourceState {
  switch (event.type) {
    case 'sourceChosen':
      return { ...state, source: event.source, snapshotTables: [] };
    case 'sqlChanged':
      return { ...state, sql: event.sql };
    case 'dbTypeChosen':
      return { ...state, dbType: event.dbType };
    case 'snapshotLoaded':
      return { ...state, snapshotTables: event.tables };
  }
}

const isSourceKind = (value: string): value is SourceKind =>
  value === 'saved' || value === 'sql' || value === 'snapshot';

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

  const [{ source, sql, dbType, snapshotTables }, dispatch] = useReducer(
    tableSourceReducer,
    initialTableSourceState,
  );

  const parse = useMutation({
    mutationFn: (request: { sql: string; dbType: DatabaseType }) =>
      parseSqlSnapshot(request.sql, request.dbType),
    onSuccess: (result) => onChange(result),
  });
  const busy = parse.isPending;

  const error = !parse.error
    ? ''
    : parse.error instanceof Error
      ? parse.error.message
      : t('schemaTools.failed');

  const saved = useQuery({
    queryKey: ['schema-tools-tables', scope, storage.kind],
    queryFn: async () => (await readAllTables()).active.map((record) => record.state),
    enabled: storage.kind !== 'loading',
    refetchOnWindowFocus: false,
  });
  const tables =
    source === 'saved'
      ? (saved.data ?? [])
      : source === 'sql'
        ? (parse.data ?? [])
        : snapshotTables;

  const resetSql = (text: string) => {
    dispatch({ type: 'sqlChanged', sql: text });
    parse.reset();
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
            const next = event.target.value;

            if (isSourceKind(next)) dispatch({ type: 'sourceChosen', source: next });
            parse.reset();
            onStandardsChange?.([]);
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
            dispatch({ type: 'snapshotLoaded', tables: snapshot.tables });
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

                if (option) dispatch({ type: 'dbTypeChosen', dbType: option.value });
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
            onClick={() => {
              onChange([]);
              parse.mutate({ sql, dbType });
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
