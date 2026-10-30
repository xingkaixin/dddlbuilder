import { ToolLayout } from '@/components/schema-tools/ToolLayout';
import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  DEFAULT_DATA_IMPORT_OPTIONS,
  existingDataImportTarget,
  inferDataImportColumns,
  newDataImportTarget,
  type DataImportColumn,
  type DataImportDialect,
  type DataImportOptions,
  type DataImportResult,
} from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLatestRequest } from '@/hooks/useLatestRequest';
import { TableSource } from '@/components/schema-tools/TableSource';
import { runBusinessDataTask } from '@/utils/business-data/runTask';
import type { BusinessDataTask } from '@/utils/business-data/tasks';
import type { BusinessDataSource, BusinessSeparator } from '@/utils/business-data/readBusinessData';
import { applyDataImportProfile, type DataImportProfile } from '@/utils/business-data/profiles';
import { BusinessDataSourceInput } from './BusinessDataSourceInput';
import { DataImportMapping } from './DataImportMapping';
import { DataImportProfiles } from './DataImportProfiles';
import { DataImportResults } from './DataImportResults';

type ImportState = {
  source: BusinessDataSource | null;
  separator: BusinessSeparator;
  mode: 'new' | 'existing';
  dbType: DataImportDialect;
  tableName: string;
  schemaName: string;
  tables: PersistedState[];
  columns: DataImportColumn[];
  options: DataImportOptions;
  result: DataImportResult | null;
  error: string;
};

type ImportEvent =
  | { type: 'separatorChosen'; separator: BusinessSeparator }
  | { type: 'sourceReset' }
  | { type: 'sourceReadStarted' }
  | { type: 'validationStarted' }
  | { type: 'sourceRead'; source: BusinessDataSource; columns: DataImportColumn[] }
  | { type: 'validated'; result: DataImportResult }
  | { type: 'failed'; error: string }
  | { type: 'cancelled' }
  | { type: 'modeChosen'; mode: ImportState['mode']; columns: DataImportColumn[] }
  | { type: 'dbTypeChosen'; dbType: DataImportDialect }
  | { type: 'tableNameChanged'; tableName: string }
  | { type: 'schemaNameChanged'; schemaName: string }
  | { type: 'tablesSelected'; tables: PersistedState[]; columns: DataImportColumn[] }
  | { type: 'optionChanged'; patch: Partial<DataImportOptions> }
  | { type: 'columnsChanged'; columns: DataImportColumn[] }
  | { type: 'profileApplied'; profile: DataImportProfile; columns: DataImportColumn[] };

const initialImportState: ImportState = {
  source: null,
  separator: ',',
  mode: 'new',
  dbType: 'mysql',
  tableName: 'imported_data',
  schemaName: '',
  tables: [],
  columns: [],
  options: DEFAULT_DATA_IMPORT_OPTIONS,
  result: null,
  error: '',
};

function importReducer(state: ImportState, event: ImportEvent): ImportState {
  const cleared = { ...state, result: null, error: '' };

  switch (event.type) {
    case 'separatorChosen':
      return { ...cleared, separator: event.separator, source: null, columns: [] };
    case 'sourceReset':
      return { ...cleared, source: null, columns: [] };
    case 'sourceReadStarted':
      return {
        ...cleared,
        source: state.source ? { ...state.source, data: null } : null,
        columns: [],
      };
    case 'validationStarted':
    case 'cancelled':
      return cleared;
    case 'sourceRead':
      return { ...state, source: event.source, columns: event.columns };
    case 'validated':
      return { ...state, result: event.result };
    case 'failed':
      return { ...state, error: event.error };
    case 'modeChosen':
      return { ...cleared, mode: event.mode, columns: event.columns };
    case 'dbTypeChosen':
      return { ...cleared, dbType: event.dbType };
    case 'tableNameChanged':
      return { ...cleared, tableName: event.tableName };
    case 'schemaNameChanged':
      return { ...cleared, schemaName: event.schemaName };
    case 'tablesSelected':
      return { ...cleared, tables: event.tables, columns: event.columns };
    case 'optionChanged':
      return { ...cleared, options: { ...state.options, ...event.patch } };
    case 'columnsChanged':
      return { ...cleared, columns: event.columns };
    case 'profileApplied':
      return {
        ...cleared,
        mode: event.profile.mode,
        dbType: event.profile.dbType,
        tableName: event.profile.tableName,
        schemaName: event.profile.schemaName,
        separator: event.profile.separator,
        options: { ...event.profile.options },
        columns: event.columns,
      };
  }
}

export function BusinessDataImportTool() {
  const { t } = useTranslation();

  const [
    {
      source,
      separator,
      mode,
      dbType,
      tableName,
      schemaName,
      tables,
      columns,
      options,
      result,
      error,
    },
    dispatch,
  ] = useReducer(importReducer, initialImportState);
  const { run: runLatest, cancel, isPending: busy } = useLatestRequest();

  const selected =
    tables.length === 1 &&
    tables[0].objectType !== 'view' &&
    ['mysql', 'postgresql'].includes(tables[0].dbType)
      ? tables[0]
      : null;
  const existing = selected ? existingDataImportTarget(selected) : null;

  const target =
    mode === 'new' ? newDataImportTarget(dbType, tableName, schemaName, columns) : existing;

  const change = (event: ImportEvent) => {
    cancel();
    dispatch(event);
  };

  const reportError = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'dataImport.errors.read';
    const [key, address] = message.split('|');
    dispatch({
      type: 'failed',
      error: key.startsWith('dataImport.') ? t(key, { address }) : message,
    });
  };
  const mapExisting = (table: PersistedState, value: BusinessDataSource | null) =>
    existingDataImportTarget(table).fields.map((field) => ({
      source: value?.data?.headers.includes(field.name) ? field.name : null,
      name: field.name,
      type: field.type,
      nullable: field.nullable,
    }));

  const run = async (task: BusinessDataTask) => {
    dispatch({ type: task.kind === 'validate' ? 'validationStarted' : 'sourceReadStarted' });

    try {
      const output = await runLatest(({ signal }) => runBusinessDataTask(task, signal));

      if (!output) return;

      if ('result' in output) dispatch({ type: 'validated', result: output.result });
      else
        dispatch({
          type: 'sourceRead',
          source: output.source,
          columns: !output.source.data
            ? []
            : mode === 'new'
              ? inferDataImportColumns(output.source.data, dbType, options)
              : selected
                ? mapExisting(selected, output.source)
                : [],
        });
    } catch (cause) {
      reportError(cause);
    }
  };

  const profile: Omit<DataImportProfile, 'name'> | null =
    source?.data && target && columns.length
      ? {
          version: 1,
          mode,
          dbType: target.dbType,
          tableName: target.tableName,
          schemaName: target.schemaName,
          separator,
          options,
          columns,
        }
      : null;

  return (
    <ToolLayout title={t('dataImport.title')} description={t('dataImport.description')}>
      <BusinessDataSourceInput
        source={source}
        separator={separator}
        busy={busy}
        onSeparator={(value) => change({ type: 'separatorChosen', separator: value })}
        onReset={() => change({ type: 'sourceReset' })}
        onRead={run}
      />
      <section className="min-w-0 space-y-4 border-t pt-5">
        <h3 className="text-sm font-semibold">{t('dataImport.targetTitle')}</h3>
        <label className="block space-y-2 text-sm">
          <span>{t('dataImport.targetMode')}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={mode}
            onChange={(event) => {
              const value = event.target.value;

              if (value !== 'new' && value !== 'existing') return;
              change({
                type: 'modeChosen',
                mode: value,
                columns:
                  value === 'new' && source?.data
                    ? inferDataImportColumns(source.data, dbType, options)
                    : value === 'existing' && selected
                      ? mapExisting(selected, source)
                      : [],
              });
            }}
          >
            <option value="new">{t('dataImport.newTable')}</option>
            <option value="existing">{t('dataImport.existingTable')}</option>
          </select>
        </label>
        {mode === 'new' ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-2 text-sm">
              <span>{t('dataImport.database')}</span>
              <select
                className="h-9 w-full rounded-md border bg-background px-3"
                value={dbType}
                onChange={(event) => {
                  const value = event.target.value;

                  if (value === 'mysql' || value === 'postgresql')
                    change({ type: 'dbTypeChosen', dbType: value });
                }}
              >
                <option value="mysql">MySQL</option>
                <option value="postgresql">PostgreSQL</option>
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span>{t('dataImport.tableName')}</span>
              <Input
                value={tableName}
                maxLength={64}
                onChange={(event) =>
                  change({ type: 'tableNameChanged', tableName: event.target.value })
                }
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>{t('dataImport.schemaName')}</span>
              <Input
                value={schemaName}
                maxLength={64}
                onChange={(event) =>
                  change({ type: 'schemaNameChanged', schemaName: event.target.value })
                }
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('dataImport.selectOne')}</p>
            <TableSource
              value={tables}
              onChange={(value) => {
                try {
                  change({
                    type: 'tablesSelected',
                    tables: value,
                    columns: value.length === 1 ? mapExisting(value[0], source) : [],
                  });
                } catch (cause) {
                  change({ type: 'tablesSelected', tables: value, columns: [] });
                  reportError(cause);
                }
              }}
            />
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <label className="space-y-2 text-sm">
            <span>{t('dataImport.dateFormat')}</span>
            <select
              className="block h-9 rounded-md border bg-background px-3"
              value={options.dateFormat}
              onChange={(event) => {
                const value = event.target.value;

                if (value === 'iso' || value === 'dmy' || value === 'mdy')
                  change({ type: 'optionChanged', patch: { dateFormat: value } });
              }}
            >
              <option value="iso">YYYY-MM-DD</option>
              <option value="dmy">DD/MM/YYYY</option>
              <option value="mdy">MM/DD/YYYY</option>
            </select>
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={options.emptyAsNull}
              onChange={(event) =>
                change({ type: 'optionChanged', patch: { emptyAsNull: event.target.checked } })
              }
            />
            {t('dataImport.emptyAsNull')}
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={options.trim}
              onChange={(event) =>
                change({ type: 'optionChanged', patch: { trim: event.target.checked } })
              }
            />
            {t('dataImport.trim')}
          </label>
        </div>
        {source?.data && mode === 'new' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (source.data)
                change({
                  type: 'columnsChanged',
                  columns: inferDataImportColumns(source.data, dbType, options),
                });
            }}
          >
            {t('dataImport.inferAgain')}
          </Button>
        )}
        {source?.data && columns.length > 0 && (
          <DataImportMapping
            data={source.data}
            columns={columns}
            editable={mode === 'new'}
            onChange={(value) => change({ type: 'columnsChanged', columns: value })}
          />
        )}
      </section>
      <DataImportProfiles
        current={profile}
        onError={reportError}
        onApply={(value) => {
          if (!source?.data) throw new Error('dataImport.errors.empty');
          const mapped = applyDataImportProfile(value, source.data, existing);
          change({ type: 'profileApplied', profile: value, columns: mapped });
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={busy || !source?.data || !target || !columns.length}
          onClick={() => {
            if (source?.data && target)
              void run({
                kind: 'validate',
                data: source.data,
                target,
                columns,
                options,
                createTable: mode === 'new',
              });
          }}
        >
          {t('dataImport.validate')}
        </Button>
        {busy && (
          <>
            <span role="status" className="text-sm text-muted-foreground">
              {t('dataImport.processing')}
            </span>
            <Button variant="ghost" onClick={() => change({ type: 'cancelled' })}>
              {t('common.cancel')}
            </Button>
          </>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="whitespace-pre-wrap break-words rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {result && <DataImportResults result={result} />}
    </ToolLayout>
  );
}
