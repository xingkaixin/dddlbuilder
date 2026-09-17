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
    <div className="grid min-h-full gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-5 md:border-r md:pr-5">
        <h2 className="text-base font-semibold">{t('schemaTools.dictionary.title')}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t('schemaTools.dictionary.hint')}
        </p>
        <TableSource value={tables} onChange={setTables} onStandardsChange={setImportedStandards} />
      </div>
      <div className="min-w-0 space-y-4">
        <label className="block space-y-2 text-sm font-medium">
          <span>{t('schemaTools.dictionary.documentTitle')}</span>
          <Input
            value={title}
            placeholder={t('schemaTools.dictionary.defaultTitle')}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
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
            {t('schemaTools.dictionary.markdown')}
          </Button>
          <Button
            disabled={!ready}
            onClick={() =>
              downloadFile(
                dictionaryHtml(document),
                'database-dictionary.html',
                'text/html;charset=utf-8',
              )
            }
          >
            {t('schemaTools.dictionary.html')}
          </Button>
        </div>
        {standards.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('schemaTools.loadFailed')}{' '}
            <Button variant="ghost" onClick={() => void standards.refetch()}>
              {t('common.retry')}
            </Button>
          </p>
        )}
        <Button
          variant="outline"
          disabled={!ready}
          onClick={() =>
            downloadFile(
              encodeDeliverySnapshot({
                tables,
                standards: selectedStandards,
              }),
              'schema-snapshot.json',
              'application/json',
            )
          }
        >
          {t('snapshot.export')}
        </Button>
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
        <DictionaryReader document={document} />
      </div>
    </div>
  );
}
