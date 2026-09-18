import type { StandardSummary } from '@ddlbuilder/shared-types/api';
import { SnapshotFileInput } from './SnapshotFileInput';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PersistedState, DatabaseType } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { listSavedTables } from '@/utils/savedTablesDb';
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
  const scope = useWorkspaceScope();
  const [source, setSource] = useState('saved');
  const [sql, setSql] = useState('');
  const [dbType, setDbType] = useState<DatabaseType>('mysql');
  const [parsed, setParsed] = useState<PersistedState[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const saved = useQuery({
    queryKey: ['schema-tools-tables', scope],
    queryFn: async () =>
      scope ? (await listSavedTables(scope)).map((record) => record.state) : [],
    enabled: Boolean(scope),
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
            variant="outline"
            size="sm"
            disabled={saved.isFetching || !scope}
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
        <fieldset className="space-y-2 border-t pt-4">
          <legend className="text-sm font-medium">
            {t('schemaTools.selection', { count: value.length })}
          </legend>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onChange(tables)}>
              {t('schemaTools.all')}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              {t('schemaTools.none')}
            </Button>
          </div>
          <div className="max-h-72 space-y-1 overflow-auto">
            {tables.map((table, index) => (
              <label
                key={index}
                className="flex items-start gap-2 rounded px-2 py-2 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-primary"
                  checked={value.includes(table)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [...value, table]
                        : value.filter((selected) => selected !== table),
                    )
                  }
                />
                <span className="min-w-0 break-words">
                  {[table.schemaName, table.tableName].filter(Boolean).join('.')}
                  <span className="block text-xs text-muted-foreground">
                    {table.tableComment || table.dbType}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        source === 'saved' &&
        saved.isSuccess && (
          <p className="text-sm text-muted-foreground">{t('schemaTools.emptySaved')}</p>
        )
      )}
    </section>
  );
}
