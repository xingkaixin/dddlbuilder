import { useEffect, useRef, useState } from 'react';
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
import { TableSource } from '@/components/schema-tools/TableSource';
import { runBusinessDataTask } from '@/utils/business-data/runTask';
import type { BusinessDataTask } from '@/utils/business-data/tasks';
import type { BusinessDataSource, BusinessSeparator } from '@/utils/business-data/readBusinessData';
import { applyDataImportProfile, type DataImportProfile } from '@/utils/business-data/profiles';
import { BusinessDataSourceInput } from './BusinessDataSourceInput';
import { DataImportMapping } from './DataImportMapping';
import { DataImportProfiles } from './DataImportProfiles';
import { DataImportResults } from './DataImportResults';

export function BusinessDataImportTool() {
  const { t } = useTranslation();
  const [source, setSource] = useState<BusinessDataSource | null>(null);
  const [separator, setSeparator] = useState<BusinessSeparator>(',');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [dbType, setDbType] = useState<DataImportDialect>('mysql');
  const [tableName, setTableName] = useState('imported_data');
  const [schemaName, setSchemaName] = useState('');
  const [tables, setTables] = useState<PersistedState[]>([]);
  const [columns, setColumns] = useState<DataImportColumn[]>([]);
  const [options, setOptions] = useState<DataImportOptions>(DEFAULT_DATA_IMPORT_OPTIONS);
  const [result, setResult] = useState<DataImportResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const selected =
    tables.length === 1 &&
    tables[0].objectType !== 'view' &&
    ['mysql', 'postgresql'].includes(tables[0].dbType)
      ? tables[0]
      : null;
  const existing = selected ? existingDataImportTarget(selected) : null;

  const target =
    mode === 'new' ? newDataImportTarget(dbType, tableName, schemaName, columns) : existing;

  const clearResult = () => {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setResult(null);
    setError('');
  };

  const reportError = (cause: unknown) => {
    const message = cause instanceof Error ? cause.message : 'dataImport.errors.read';
    const [key, address] = message.split('|');
    setError(key.startsWith('dataImport.') ? t(key, { address }) : message);
  };
  const mapExisting = (table: PersistedState, value: BusinessDataSource | null) =>
    existingDataImportTarget(table).fields.map((field) => ({
      source: value?.data?.headers.includes(field.name) ? field.name : null,
      name: field.name,
      type: field.type,
      nullable: field.nullable,
    }));

  const run = async (task: BusinessDataTask) => {
    clearResult();

    if (task.kind !== 'validate') {
      setSource((current) => (current ? { ...current, data: null } : null));
      setColumns([]);
    }

    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);

    try {
      const output = await runBusinessDataTask(task, controller.signal);

      if (controller.signal.aborted) return;

      if ('result' in output) setResult(output.result);
      else {
        setSource(output.source);
        setColumns(
          !output.source.data
            ? []
            : mode === 'new'
              ? inferDataImportColumns(output.source.data, dbType, options)
              : selected
                ? mapExisting(selected, output.source)
                : [],
        );
      }
    } catch (cause) {
      if (!controller.signal.aborted) reportError(cause);
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
      }
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
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-base font-semibold">{t('dataImport.title')}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t('dataImport.description')}
        </p>
      </div>
      <BusinessDataSourceInput
        source={source}
        separator={separator}
        busy={busy}
        onSeparator={(value) => {
          clearResult();
          setSeparator(value);
          setSource(null);
          setColumns([]);
        }}
        onReset={() => {
          clearResult();
          setSource(null);
          setColumns([]);
        }}
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
              clearResult();
              setMode(value);
              setColumns(
                value === 'new' && source?.data
                  ? inferDataImportColumns(source.data, dbType, options)
                  : value === 'existing' && selected
                    ? mapExisting(selected, source)
                    : [],
              );
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

                  if (value === 'mysql' || value === 'postgresql') {
                    clearResult();
                    setDbType(value);
                  }
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
                onChange={(event) => {
                  clearResult();
                  setTableName(event.target.value);
                }}
              />
            </label>
            <label className="space-y-2 text-sm">
              <span>{t('dataImport.schemaName')}</span>
              <Input
                value={schemaName}
                maxLength={64}
                onChange={(event) => {
                  clearResult();
                  setSchemaName(event.target.value);
                }}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t('dataImport.selectOne')}</p>
            <TableSource
              value={tables}
              onChange={(value) => {
                clearResult();
                setTables(value);

                try {
                  setColumns(value.length === 1 ? mapExisting(value[0], source) : []);
                } catch (cause) {
                  setColumns([]);
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

                if (value === 'iso' || value === 'dmy' || value === 'mdy') {
                  clearResult();
                  setOptions({ ...options, dateFormat: value });
                }
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
              onChange={(event) => {
                clearResult();
                setOptions({ ...options, emptyAsNull: event.target.checked });
              }}
            />
            {t('dataImport.emptyAsNull')}
          </label>
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={options.trim}
              onChange={(event) => {
                clearResult();
                setOptions({ ...options, trim: event.target.checked });
              }}
            />
            {t('dataImport.trim')}
          </label>
        </div>
        {source?.data && mode === 'new' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              clearResult();

              if (source.data) setColumns(inferDataImportColumns(source.data, dbType, options));
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
            onChange={(value) => {
              clearResult();
              setColumns(value);
            }}
          />
        )}
      </section>
      <DataImportProfiles
        current={profile}
        onError={reportError}
        onApply={(value) => {
          if (!source?.data) throw new Error('dataImport.errors.empty');
          const mapped = applyDataImportProfile(value, source.data, existing);
          clearResult();
          setMode(value.mode);
          setDbType(value.dbType);
          setTableName(value.tableName);
          setSchemaName(value.schemaName);
          setSeparator(value.separator);
          setOptions({ ...value.options });
          setColumns(mapped);
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
            <Button variant="ghost" onClick={clearResult}>
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
    </div>
  );
}
