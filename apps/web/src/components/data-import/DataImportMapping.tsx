import { useTranslation } from 'react-i18next';
import type { BusinessData, DataImportColumn } from '@ddlbuilder/ddl-core';
import { Input } from '@/components/ui/input';

export function DataImportMapping({
  data,
  columns,
  editable,
  onChange,
}: {
  data: BusinessData;
  columns: DataImportColumn[];
  editable: boolean;
  onChange: (columns: DataImportColumn[]) => void;
}) {
  const { t } = useTranslation();

  const update = (index: number, patch: Partial<DataImportColumn>) =>
    onChange(
      columns.map((column, position) => (position === index ? { ...column, ...patch } : column)),
    );
  const ignored = data.headers.filter(
    (header) => !columns.some((column) => column.source === header),
  );

  return (
    <div className="min-w-0 space-y-2">
      <div className="max-h-[28rem] overflow-auto rounded-md border">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              {['sourceColumn', 'fieldName', 'fieldType', 'nullable', 'sample'].map((label) => (
                <th scope="col" key={label} className="p-3 font-medium">
                  {t(`dataImport.${label}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {columns.map((column, index) => (
              <tr key={index} className="border-t align-top">
                <td className="p-2">
                  <select
                    className="h-9 w-full min-w-32 max-w-52 rounded-md border bg-background px-2"
                    aria-label={t('dataImport.sourceFor', { name: column.name || index + 1 })}
                    value={column.source ?? ''}
                    onChange={(event) => update(index, { source: event.target.value || null })}
                  >
                    <option value="">
                      {t(editable ? 'dataImport.ignore' : 'dataImport.omit')}
                    </option>
                    {data.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  {editable ? (
                    <Input
                      className="min-w-32 max-w-52"
                      aria-label={`${t('dataImport.fieldName')} ${index + 1}`}
                      value={column.name}
                      maxLength={64}
                      onChange={(event) => update(index, { name: event.target.value })}
                    />
                  ) : (
                    <span className="block px-1 py-2 font-mono">{column.name}</span>
                  )}
                </td>
                <td className="p-2">
                  {editable ? (
                    <Input
                      className="min-w-36 max-w-52 font-mono"
                      aria-label={`${t('dataImport.fieldType')} ${index + 1}`}
                      value={column.type}
                      maxLength={200}
                      onChange={(event) => update(index, { type: event.target.value })}
                    />
                  ) : (
                    <span className="block px-1 py-2 font-mono">{column.type}</span>
                  )}
                </td>
                <td className="p-3">
                  {editable ? (
                    <input
                      type="checkbox"
                      aria-label={`${t('dataImport.nullable')} ${index + 1}`}
                      checked={column.nullable}
                      onChange={(event) => update(index, { nullable: event.target.checked })}
                    />
                  ) : (
                    t(column.nullable ? 'dataImport.yes' : 'dataImport.no')
                  )}
                </td>
                <td className="max-w-60 p-3 text-muted-foreground">
                  {column.source &&
                    data.rows.slice(0, 2).map((row) => (
                      <p
                        key={row.line}
                        className="truncate"
                        title={row.values[data.headers.indexOf(column.source ?? '')]}
                      >
                        {row.values[data.headers.indexOf(column.source ?? '')] || '—'}
                      </p>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ignored.length > 0 && (
        <p className="break-words text-xs text-muted-foreground">
          {t('dataImport.ignored', { names: ignored.join(', ') })}
        </p>
      )}
    </div>
  );
}
