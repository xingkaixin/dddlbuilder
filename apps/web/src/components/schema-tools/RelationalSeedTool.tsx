import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  generateRelationalSeed,
  snapshotTableKey,
  snapshotTableLabel,
  type RelationalSeedResult,
} from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadFile } from '@/utils/mockDataGenerator';
import { TableSource } from './TableSource';

export function RelationalSeedTool() {
  const { t } = useTranslation();
  const [tables, setTables] = useState<PersistedState[]>([]);
  const [counts, setCounts] = useState(new Map<string, number>());
  const [seed, setSeed] = useState('ddlbuilder');
  const [includeLogical, setIncludeLogical] = useState(false);
  const [result, setResult] = useState<RelationalSeedResult | null>(null);
  const [error, setError] = useState('');
  const total = tables.reduce((sum, table) => sum + (counts.get(snapshotTableKey(table)) ?? 10), 0);

  const clear = () => {
    setResult(null);
    setError('');
  };

  return (
    <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-5 md:border-r md:pr-5">
        <h2 className="text-base font-semibold">{t('schemaTools.seed.title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('schemaTools.seed.hint')}
        </p>
        <TableSource
          value={tables}
          onChange={(value) => {
            setTables(value);
            clear();
          }}
        />
      </div>
      <div className="min-w-0 space-y-4">
        <label className="block space-y-2 text-sm font-medium">
          <span>{t('schemaTools.seed.seed')}</span>
          <Input
            value={seed}
            maxLength={200}
            onChange={(event) => {
              setSeed(event.target.value);
              clear();
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">{t('schemaTools.seed.seedHint')}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeLogical}
            onChange={(event) => {
              setIncludeLogical(event.target.checked);
              clear();
            }}
          />
          {t('schemaTools.seed.logical')}
        </label>
        <div className="space-y-2">
          {tables.map((table, index) => (
            <label
              key={index}
              className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
            >
              <span className="min-w-0 break-words">{snapshotTableLabel(table)}</span>
              <Input
                type="number"
                min={1}
                max={1000}
                className="w-24 shrink-0"
                aria-label={t('schemaTools.seed.rowsFor', { name: snapshotTableLabel(table) })}
                value={counts.get(snapshotTableKey(table)) ?? 10}
                onChange={(event) => {
                  setCounts((current) =>
                    new Map(current).set(snapshotTableKey(table), Number(event.target.value)),
                  );
                  clear();
                }}
              />
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('schemaTools.seed.limit', { count: total })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!tables.length || total > 10000}
            onClick={() => {
              clear();

              try {
                setResult(
                  generateRelationalSeed(
                    tables.map((table) => ({
                      table,
                      rowCount: counts.get(snapshotTableKey(table)) ?? 10,
                    })),
                    seed,
                    includeLogical,
                  ),
                );
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : t('schemaTools.failed'));
              }
            }}
          >
            {t('schemaTools.seed.generate')}
          </Button>
          <Button
            variant="outline"
            disabled={!result}
            onClick={() => {
              if (result)
                downloadFile(result.sql, 'relational-test-data.sql', 'text/plain;charset=utf-8');
            }}
          >
            {t('schemaTools.seed.exportSql')}
          </Button>
          <Button
            variant="outline"
            disabled={!result}
            onClick={() => {
              if (result)
                downloadFile(
                  result.json,
                  'relational-test-data.json',
                  'application/json;charset=utf-8',
                );
            }}
          >
            {t('schemaTools.seed.exportJson')}
          </Button>
        </div>
        {error && (
          <p
            role="alert"
            className="whitespace-pre-wrap break-words rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {!tables.length && (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {t('schemaTools.seed.empty')}
          </p>
        )}
        {result && (
          <>
            <p role="status" className="text-sm">
              {t('schemaTools.seed.success', { tables: result.tables.length, rows: total })}
            </p>
            <p className="text-xs text-muted-foreground">{t('schemaTools.seed.outputHint')}</p>
            {result.tables.map((table) => (
              <section key={table.name} className="space-y-2 border-t pt-4">
                <h3 className="text-sm font-medium">
                  {table.name} · {t('schemaTools.seed.rows', { count: table.rows.length })}
                </h3>
                <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(table.rows.slice(0, 5), null, 2)}
                </pre>
              </section>
            ))}
            <details>
              <summary className="cursor-pointer text-sm">
                {t('schemaTools.seed.previewSql')}
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                {result.sql.slice(0, 12000)}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
