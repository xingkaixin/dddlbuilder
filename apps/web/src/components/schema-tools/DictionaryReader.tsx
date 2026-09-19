import { BookOpen, Search, Table2 } from '@/components/icons';
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
      {document.tables.length > 0 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={t('schemaTools.dictionary.search')}
            placeholder={t('schemaTools.dictionary.search')}
            className="h-10 bg-background pl-9 pr-3 text-sm shadow-none"
          />
        </div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed bg-background px-5 py-10 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
            <BookOpen className="size-6" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">{t('schemaTools.dictionary.emptyTitle')}</p>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-muted-foreground">
            {t('schemaTools.dictionary.empty')}
          </p>
        </div>
      )}
      {document.tables.length > 0 && !visible.length && (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          {t('schemaTools.noMatches')}
        </p>
      )}
      {visible.length > 0 && (
        <nav
          aria-label={t('schemaTools.dictionary.contents')}
          className="flex flex-wrap items-center gap-2 text-xs"
        >
          <span className="mr-1 text-muted-foreground">{t('schemaTools.dictionary.contents')}</span>
          {visible.map((table) => (
            <a
              className="rounded-md border bg-background px-2 py-1 font-mono text-xs transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              key={table.id}
              href={`#dictionary-${table.id}`}
            >
              {table.name}
            </a>
          ))}
        </nav>
      )}
      {visible.map((table) => (
        <section
          id={`dictionary-${table.id}`}
          key={table.id}
          className="scroll-mt-6 space-y-4 rounded-lg border bg-background p-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Table2 className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="break-words font-mono text-sm font-semibold">{table.name}</h3>
              <p className="text-xs text-muted-foreground">
                <span className="uppercase">{table.database}</span> ·{' '}
                {t('schemaTools.fieldCount', { count: table.fields.length })}
              </p>
            </div>
          </div>
          {table.description && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {table.description}
            </p>
          )}
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
        <thead className="bg-muted/60">
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
            <tr key={index} className="border-t transition-colors hover:bg-muted/30">
              {row.map((cell, column) => (
                <td
                  key={column}
                  className="min-w-20 whitespace-pre-wrap px-3 py-2.5 align-top leading-relaxed first:font-mono first:font-medium"
                >
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
