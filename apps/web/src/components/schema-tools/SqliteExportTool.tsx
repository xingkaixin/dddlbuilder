import { ToolLayout } from './ToolLayout';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildSqliteProject } from '@ddlbuilder/ddl-core';
import { TableSource } from './TableSource';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/utils/mockDataGenerator';

export function SqliteExportTool() {
  const { t } = useTranslation();
  const [target, setTarget] = useState<'sqlite' | 'd1'>('d1');
  const [tables, setTables] = useState<PersistedState[]>([]);
  let result: ReturnType<typeof buildSqliteProject> | null = null;
  let error = '';

  try {
    if (tables.length) result = buildSqliteProject(tables, target);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : t('schemaTools.failed');
  }

  return (
    <ToolLayout
      title={t('modelTools.sqlite')}
      description={t('modelTools.sqliteHint')}
      source={
        <>
          <label className="grid gap-2 text-sm">
            {t('modelTools.sqliteTarget')}
            <select
              aria-label={t('modelTools.sqliteTarget')}
              className="h-9 rounded border bg-background px-2"
              value={target}
              onChange={(event) => setTarget(event.target.value === 'sqlite' ? 'sqlite' : 'd1')}
            >
              <option value="d1">Cloudflare D1</option>
              <option value="sqlite">SQLite</option>
            </select>
          </label>
          {target === 'd1' && (
            <p className="text-xs text-muted-foreground">{t('modelTools.d1Limits')}</p>
          )}
          <TableSource value={tables} onChange={setTables} />
        </>
      }
    >
      <p className="rounded border p-3 text-sm">{t('modelTools.sqliteScope')}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => downloadFile(result.sql, '0001_init.sql', 'text/plain')}>
              {t('modelTools.initSql')}
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadFile(result.schema, 'schema.ts', 'text/plain')}
            >
              {t('modelTools.drizzleSchema')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(t('modelTools.sqliteReadme'), 'README.md', 'text/markdown')
              }
            >
              {t('modelTools.instructions')}
            </Button>
          </div>
          <h3 className="text-sm font-semibold">0001_init.sql</h3>
          <pre className="max-h-80 overflow-auto rounded bg-muted p-4 text-xs">{result.sql}</pre>
          <h3 className="text-sm font-semibold">schema.ts</h3>
          <pre className="max-h-80 overflow-auto rounded bg-muted p-4 text-xs">{result.schema}</pre>
        </>
      )}
    </ToolLayout>
  );
}
