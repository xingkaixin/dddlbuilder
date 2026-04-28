import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ParsedTableItem, FailedItem } from './types';

interface TableSelectStepProps {
  tables: ParsedTableItem[];
  failed: FailedItem[];
  onToggleSelect: (index: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function TableSelectStep({
  tables,
  failed,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
}: TableSelectStepProps) {
  const { t } = useTranslation();
  const selectedCount = tables.filter((t) => t.selected).length;
  const conflictCount = tables.filter((t) => t.conflict && t.selected).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('batchImportSql.selectedCount', {
            selected: selectedCount,
            total: tables.length,
          })}
          {conflictCount > 0
            ? ` · ${t('batchImportSql.conflictCount', { count: conflictCount })}`
            : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs text-primary hover:underline"
          >
            {t('batchImportSql.selectAll')}
          </button>
          <span className="text-xs text-muted-foreground">|</span>
          <button
            type="button"
            onClick={onDeselectAll}
            className="text-xs text-primary hover:underline"
          >
            {t('batchImportSql.deselectAll')}
          </button>
        </div>
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-md border">
        {tables.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            {t('batchImportSql.noTables')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <span className="sr-only">{t('batchImportSql.select')}</span>
                </th>
                <th className="px-3 py-2 text-left font-medium">{t('batchImportSql.tableName')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('batchImportSql.fields')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('batchImportSql.indexes')}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {t('batchImportSql.foreignKeys')}
                </th>
              </tr>
            </thead>
            <tbody>
              {tables.map((table, index) => (
                <tr
                  key={table.tableName || index}
                  className={`border-t transition-colors hover:bg-muted/30 ${
                    table.conflict ? 'bg-destructive/5' : ''
                  }`}
                >
                  <td className="px-3 py-2">
                    <Checkbox
                      checked={table.selected}
                      onCheckedChange={() => onToggleSelect(index)}
                      aria-label={t('batchImportSql.selectTable', {
                        name: table.tableName,
                      })}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{table.tableName}</span>
                      {table.conflict && (
                        <Badge variant="destructive" className="text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {t('batchImportSql.conflict')}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {table.fields.length}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {table.indexes.length}
                  </td>
                  <td className="px-3 py-2 text-right text-muted-foreground">
                    {table.foreignKeys.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {failed.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium text-destructive">
            {t('batchImportSql.parseFailedTitle', { count: failed.length })}
          </div>
          <div className="max-h-[120px] overflow-y-auto rounded-md border border-destructive/20 bg-destructive/5 p-3 space-y-2">
            {failed.map((item, i) => (
              <div key={i} className="text-xs">
                <p className="font-mono text-muted-foreground truncate">{item.statement}</p>
                <p className="text-destructive mt-0.5">{item.error}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
