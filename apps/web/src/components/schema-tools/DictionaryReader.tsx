import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import type { DictionaryDocument } from './dictionary';

export function DictionaryReader({ document }: { document: DictionaryDocument }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');

  const visible = document.tables.filter((table) =>
    JSON.stringify(table).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );

  return (
    <div className="min-w-0 space-y-4">
      <Input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        aria-label={t('schemaTools.dictionary.search')}
        placeholder={t('schemaTools.dictionary.search')}
      />
      {!document.tables.length && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t('schemaTools.dictionary.empty')}
        </p>
      )}
      {document.tables.length > 0 && !visible.length && (
        <p role="status">{t('schemaTools.noMatches')}</p>
      )}
      <nav
        aria-label={t('schemaTools.dictionary.contents')}
        className="flex flex-wrap gap-x-4 gap-y-2 text-sm"
      >
        {visible.map((table) => (
          <a
            className="text-primary underline underline-offset-4"
            key={table.id}
            href={`#dictionary-${table.id}`}
          >
            {table.name}
          </a>
        ))}
      </nav>
      {visible.map((table) => (
        <section id={`dictionary-${table.id}`} key={table.id} className="space-y-3 border-t pt-5">
          <h3 className="break-words text-lg font-semibold">{table.name}</h3>
          <p className="text-xs text-muted-foreground">
            {table.database} · {t('schemaTools.fieldCount', { count: table.fields.length })}
          </p>
          {table.description && <p className="whitespace-pre-wrap text-sm">{table.description}</p>}
          <DictionaryGrid headers={document.labels.fieldHeaders} rows={table.fields} />
          {table.indexes.length > 0 && (
            <>
              <h4 className="text-sm font-medium">{document.labels.indexes}</h4>
              <DictionaryGrid headers={document.labels.indexHeaders} rows={table.indexes} />
            </>
          )}
          {table.relationships.length > 0 && (
            <>
              <h4 className="text-sm font-medium">{document.labels.relationships}</h4>
              <DictionaryGrid
                headers={document.labels.relationshipHeaders}
                rows={table.relationships.map((relation) => relation.values)}
              />
              <div className="flex flex-wrap gap-3 text-sm">
                {table.relationships.flatMap((relation, index) =>
                  relation.targetId
                    ? [
                        <a
                          key={index}
                          className="text-primary underline"
                          href={`#dictionary-${relation.targetId}`}
                          onClick={() => setSearch('')}
                        >
                          {relation.values[2]}
                        </a>,
                      ]
                    : [],
                )}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function DictionaryGrid({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-xs">
        <thead className="bg-muted">
          <tr>
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-2 font-medium" scope="col">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-t">
              {row.map((cell, column) => (
                <td key={column} className="min-w-20 whitespace-pre-wrap px-3 py-2 align-top">
                  {cell || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
