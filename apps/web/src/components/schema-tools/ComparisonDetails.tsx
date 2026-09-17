import type { SchemaComparison } from '@ddlbuilder/ddl-core';
import { useTranslation } from 'react-i18next';
import { comparisonDetails } from './comparisonReport';

export function ComparisonDetails({ comparison }: { comparison: SchemaComparison }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      {comparison.tables.map((table) => (
        <section key={table.key} className="space-y-2 border-t pt-4">
          <h2 className="font-semibold">
            {table.name} · {t(`schemaTools.compare.${table.status}`)}
          </h2>
          {table.diff ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {['change', 'object', 'before', 'after'].map((key) => (
                      <th key={key} className="p-2">
                        {t(`schemaTools.compare.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparisonDetails(table, t).map((row, index) => (
                    <tr key={index} className="border-t">
                      {row.map((cell, column) => (
                        <td key={column} className="min-w-24 whitespace-pre-wrap p-2 align-top">
                          {cell || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm">
              {(table.after ?? table.before)?.rows
                .flatMap((row) =>
                  row.fieldName.trim() ? [`${row.fieldName} ${row.fieldType}`] : [],
                )
                .join(', ')}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
