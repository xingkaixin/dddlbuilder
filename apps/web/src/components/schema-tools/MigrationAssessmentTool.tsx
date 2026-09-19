import { ToolLayout } from './ToolLayout';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { assessMysqlToPostgres } from '@ddlbuilder/ddl-core';
import { TableSource } from './TableSource';
import { markdownTable } from './dictionary';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/utils/mockDataGenerator';

export function MigrationAssessmentTool() {
  const { t } = useTranslation();
  const [tables, setTables] = useState<PersistedState[]>([]);

  const result = useMemo(() => {
    if (!tables.length) return null;

    try {
      return { items: assessMysqlToPostgres(tables), error: '' };
    } catch (cause) {
      return { items: [], error: cause instanceof Error ? cause.message : t('schemaTools.failed') };
    }
  }, [tables, t]);
  const headers = ['object', 'source', 'target', 'level', 'reason'].map((key) =>
    t(`assessment.${key}`),
  );
  const rows =
    result?.items.map((item) => [
      item.object,
      item.source,
      item.target || '—',
      t(`assessment.${item.level}`),
      t(`assessment.reasons.${item.reason}`),
    ]) ?? [];

  return (
    <ToolLayout
      title={t('assessment.title')}
      description={t('assessment.hint')}
      source={
        <>
          <p className="text-sm font-medium">MySQL → PostgreSQL</p>
          <TableSource value={tables} onChange={setTables} />
        </>
      }
    >
      {result?.error && (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      )}
      <Button
        disabled={!rows.length}
        onClick={() =>
          downloadFile(
            `# MySQL → PostgreSQL\n\n${t('assessment.hint')}\n\n${markdownTable(headers, rows)}`,
            'migration-assessment.md',
            'text/markdown',
          )
        }
      >
        {t('assessment.export')}
      </Button>
      {rows.length > 0 && (
        <>
          <p role="status" className="text-sm">
            {['mapped', 'manual', 'unsupported']
              .map(
                (level) =>
                  `${t(`assessment.${level}`)}: ${result?.items.filter((item) => item.level === level).length ?? 0}`,
              )
              .join(' · ')}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  {headers.map((header) => (
                    <th key={header} className="p-2">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t">
                    {row.map((cell, column) => (
                      <td key={column} className="min-w-24 whitespace-pre-wrap p-2 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ToolLayout>
  );
}
