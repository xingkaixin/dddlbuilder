import { useTranslation } from 'react-i18next';
import type { DataImportResult } from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/utils/mockDataGenerator';

export function DataImportResults({ result }: { result: DataImportResult }) {
  const { t } = useTranslation();

  return (
    <section className="min-w-0 space-y-4 border-t pt-5">
      <h3 className="text-sm font-semibold">{t('dataImport.resultTitle')}</h3>
      <p role="status" className={result.issues.length ? 'text-sm text-destructive' : 'text-sm'}>
        {t(result.issues.length ? 'dataImport.invalid' : 'dataImport.valid', {
          count: result.issues.length || result.rowCount,
        })}
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('dataImport.validationScope')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!result.sql}
          onClick={() => downloadFile(result.sql, 'business-data.sql', 'text/plain;charset=utf-8')}
        >
          {t('dataImport.downloadSql')}
        </Button>
        {result.issues.length > 0 && (
          <Button
            variant="outline"
            onClick={() =>
              downloadFile(
                JSON.stringify(
                  result.issues.map((issue) => ({
                    ...issue,
                    reason: t(`dataImport.issues.${issue.code}`),
                  })),
                  null,
                  2,
                ),
                'business-data-errors.json',
                'application/json;charset=utf-8',
              )
            }
          >
            {t('dataImport.downloadErrors')}
          </Button>
        )}
      </div>
      {result.issues.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t('dataImport.errorPreview')}</p>
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  {['line', 'fieldName', 'rawValue', 'reason'].map((key) => (
                    <th key={key} scope="col" className="p-3">
                      {t(`dataImport.${key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.issues.slice(0, 50).map((issue, index) => (
                  <tr key={index} className="border-t align-top">
                    <td className="p-3">{issue.line || '—'}</td>
                    <td className="max-w-40 break-words p-3">{issue.field || '—'}</td>
                    <td className="max-w-52 break-words p-3 font-mono">
                      {issue.value.slice(0, 160)}
                    </td>
                    <td className="p-3">
                      {t(`dataImport.issues.${issue.code}`)}
                      {issue.detail && (
                        <span className="mt-1 block break-words text-muted-foreground">
                          {issue.detail}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{t('dataImport.outputPreview')}</p>
          <div className="max-h-64 overflow-auto rounded-md border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted">
                <tr>
                  {result.columns.map((name) => (
                    <th key={name} scope="col" className="whitespace-nowrap p-3">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.preview.map((row, index) => (
                  <tr key={index} className="border-t">
                    {row.map((value, column) => (
                      <td
                        key={column}
                        className="max-w-60 truncate p-3 font-mono"
                        title={value ?? 'NULL'}
                      >
                        {value === null ? 'NULL' : value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details>
            <summary className="cursor-pointer text-sm">{t('dataImport.sqlPreview')}</summary>
            <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
              {result.sql.slice(0, 12000)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
