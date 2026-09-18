import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BUSINESS_MODULES,
  instantiateBusinessModule,
  businessModuleSql,
  type BusinessModule,
  type ModuleIdStrategy,
} from '@ddlbuilder/ddl-core';
import { encodeDeliverySnapshot } from '@ddlbuilder/workspace-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadFile } from '@/utils/mockDataGenerator';
import { useSavedTables } from '@/hooks/useSavedTables';

export function BusinessModuleTool() {
  const { t } = useTranslation();
  const [module, setModule] = useState<BusinessModule>('rbac');
  const [database, setDatabase] = useState<'mysql' | 'postgresql'>('mysql');
  const [prefix, setPrefix] = useState('');
  const [idStrategy, setIdStrategy] = useState<ModuleIdStrategy>('integer');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = useSavedTables();

  const generated = useMemo(() => {
    try {
      const tables = instantiateBusinessModule(module, database, prefix, idStrategy);

      return { tables, sql: businessModuleSql(tables), error: '' };
    } catch (cause) {
      return { tables: [], sql: '', error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [module, database, prefix, idStrategy]);
  const clear = () => {
    setMessage('');
    setError('');
  };

  return (
    <div className="space-y-5">
      <h2 className="font-semibold">{t('modelTools.modules')}</h2>
      <p className="text-sm text-muted-foreground">{t('modelTools.modulesHint')}</p>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          {t('modelTools.module')}
          <select
            className="h-9 rounded border bg-background px-2"
            value={module}
            onChange={(event) => {
              const next = BUSINESS_MODULES.find((item) => item === event.target.value);

              if (next) setModule(next);
              clear();
            }}
          >
            {BUSINESS_MODULES.map((item) => (
              <option key={item} value={item}>
                {t(`modelTools.${item}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          {t('schemaTools.database')}
          <select
            className="h-9 rounded border bg-background px-2"
            value={database}
            onChange={(event) => {
              setDatabase(event.target.value === 'postgresql' ? 'postgresql' : 'mysql');
              clear();
            }}
          >
            <option value="mysql">MySQL</option>
            <option value="postgresql">PostgreSQL</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm">
          {t('modelTools.prefix')}
          <Input
            value={prefix}
            maxLength={20}
            onChange={(event) => {
              setPrefix(event.target.value);
              clear();
            }}
          />
        </label>
        <label className="grid gap-2 text-sm">
          {t('modelTools.idStrategy')}
          <select
            className="h-9 rounded border bg-background px-2"
            value={idStrategy}
            onChange={(event) => {
              setIdStrategy(event.target.value === 'string' ? 'string' : 'integer');
              clear();
            }}
          >
            <option value="integer">{t('modelTools.integerId')}</option>
            <option value="string">{t('modelTools.stringId')}</option>
          </select>
        </label>
      </fieldset>
      <p className="rounded border bg-muted/40 p-3 text-sm">
        {t(`modelTools.${module}Assumptions`)}
      </p>
      {generated.tables.map((table) => (
        <details key={table.tableName} className="rounded border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {table.tableName} · {table.rows.length}
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody>
                {table.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="p-2">{row.fieldName}</td>
                    <td className="p-2">{row.fieldType}</td>
                    <td className="p-2">{row.fieldComment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {table.foreignKeys?.map((fk) => (
            <p className="mt-2 text-xs" key={fk.id}>
              {fk.fields.join(', ')} → {fk.refTable} ({fk.refFields.join(', ')})
            </p>
          ))}
        </details>
      ))}
      {(error || generated.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || generated.error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || saved.loading || !generated.tables.length}
          onClick={async () => {
            clear();
            setBusy(true);

            const result = await saved.importTables({
              items: generated.tables.map((state) => ({ name: state.tableName, state })),
              conflictStrategy: 'reject',
            });
            setBusy(false);

            if (result.successCount === generated.tables.length && !result.failCount)
              setMessage(t('modelTools.saved', { count: result.successCount }));
            else setError(t('modelTools.saveConflict'));
          }}
        >
          {t('modelTools.saveModule')}
        </Button>
        <Button
          variant="outline"
          disabled={!generated.sql || busy}
          onClick={() => downloadFile(generated.sql, `${module}.sql`, 'text/plain')}
        >
          {t('modelTools.downloadSql')}
        </Button>
        <Button
          variant="outline"
          disabled={!generated.tables.length || busy}
          onClick={() =>
            downloadFile(
              encodeDeliverySnapshot({ tables: generated.tables, standards: [] }),
              `${module}.json`,
              'application/json',
            )
          }
        >
          {t('snapshot.export')}
        </Button>
      </div>
      {generated.sql && (
        <pre className="max-h-80 overflow-auto rounded bg-muted p-4 text-xs">{generated.sql}</pre>
      )}
    </div>
  );
}
