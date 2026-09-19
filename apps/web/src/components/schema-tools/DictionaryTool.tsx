import { Download, FileText, Share2 } from '@/components/icons';
import { ToolLayout } from './ToolLayout';
import type { StandardSummary } from '@ddlbuilder/shared-types/api';
import { encodeDeliverySnapshot } from '@ddlbuilder/workspace-core';
import { DictionaryReader } from './DictionaryReader';
import { PublishPanel } from '@/components/publications/PublishPanel';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listFieldStandards } from '@/utils/fieldStandards';
import { downloadFile } from '@/utils/mockDataGenerator';
import { TableSource } from './TableSource';
import { buildDictionary, dictionaryHtml, dictionaryMarkdown } from './dictionary';

export function DictionaryTool() {
  const { t, i18n } = useTranslation();
  const [tables, setTables] = useState<PersistedState[]>([]);
  const [title, setTitle] = useState('');
  const [importedStandards, setImportedStandards] = useState<StandardSummary[]>([]);

  const standards = useQuery({
    queryKey: ['schema-tools-standards'],
    queryFn: listFieldStandards,
    refetchOnWindowFocus: false,
  });
  const selectedStandards = useMemo(() => {
    const ids = new Set(
      tables.flatMap((table) =>
        table.rows.flatMap((row) => (row.standardId ? [row.standardId] : [])),
      ),
    );

    return [
      ...new Map(
        [...(standards.data ?? []), ...importedStandards].map(
          ({ id, name, description, unit }) => [id, { id, name, description, unit }] as const,
        ),
      ).values(),
    ].filter((standard) => ids.has(standard.id));
  }, [tables, standards.data, importedStandards]);
  const document = useMemo(
    () => buildDictionary(tables, selectedStandards, title, i18n.language, t),
    [tables, selectedStandards, title, i18n.language, t],
  );
  const ready = tables.length > 0 && standards.isSuccess;

  return (
    <ToolLayout
      title={t('schemaTools.dictionary.title')}
      description={t('schemaTools.dictionary.hint')}
      source={
        <TableSource value={tables} onChange={setTables} onStandardsChange={setImportedStandards} />
      }
    >
      <label className="block space-y-2 text-sm font-medium">
        <span>{t('schemaTools.dictionary.documentTitle')}</span>
        <Input
          value={title}
          placeholder={t('schemaTools.dictionary.defaultTitle')}
          className="h-10 bg-background px-3 text-sm shadow-none"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="gap-2 shadow-none"
          disabled={!ready}
          onClick={() =>
            downloadFile(
              dictionaryHtml(document),
              'database-dictionary.html',
              'text/html;charset=utf-8',
            )
          }
        >
          <Download className="size-3.5" aria-hidden="true" />
          {t('schemaTools.dictionary.html')}
        </Button>
        <Button
          size="sm"
          className="gap-2 shadow-none"
          variant="outline"
          disabled={!ready}
          onClick={() =>
            downloadFile(
              dictionaryMarkdown(document),
              'database-dictionary.md',
              'text/markdown;charset=utf-8',
            )
          }
        >
          <FileText className="size-3.5" aria-hidden="true" />
          {t('schemaTools.dictionary.markdown')}
        </Button>
        <Button
          size="sm"
          className="gap-2 shadow-none"
          variant="outline"
          disabled={!ready}
          onClick={() =>
            downloadFile(
              encodeDeliverySnapshot({ tables, standards: selectedStandards }),
              'schema-snapshot.json',
              'application/json',
            )
          }
        >
          <Download className="size-3.5" aria-hidden="true" />
          {t('snapshot.export')}
        </Button>
      </div>
      {standards.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('schemaTools.loadFailed')}{' '}
          <Button variant="ghost" size="sm" onClick={() => void standards.refetch()}>
            {t('common.retry')}
          </Button>
        </p>
      )}
      <details className="group rounded-lg border px-3 py-2.5">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <Share2 className="size-3.5" aria-hidden="true" />
          {t('publication.publish')}
          <span className="ml-auto text-base leading-none group-open:hidden" aria-hidden="true">
            +
          </span>
          <span
            className="ml-auto hidden text-base leading-none group-open:inline"
            aria-hidden="true"
          >
            −
          </span>
        </summary>
        <div className="pt-3">
          <PublishPanel
            title={title}
            content={
              ready
                ? {
                    kind: 'document',
                    tables,
                    standards: selectedStandards,
                  }
                : null
            }
          />
        </div>
      </details>
      <section
        className="min-w-0 space-y-4 rounded-xl border bg-muted/25 p-3 sm:p-4"
        aria-label={t('schemaTools.dictionary.preview')}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t('schemaTools.dictionary.preview')}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('schemaTools.dictionary.summary', {
              tables: document.tables.length,
              fields: document.tables.reduce((count, table) => count + table.fields.length, 0),
            })}
          </span>
        </div>
        <DictionaryReader document={document} />
      </section>
    </ToolLayout>
  );
}
