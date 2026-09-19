import { ToolLayout } from './ToolLayout';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { refreshSchemaSnapshot, compareSchemaSnapshots } from '@ddlbuilder/ddl-core';
import { encodeDeliverySnapshot, type DeliverySnapshot } from '@ddlbuilder/workspace-core';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/utils/mockDataGenerator';
import { ComparisonDetails } from './ComparisonDetails';
import { comparisonMarkdown } from './comparisonReport';
import { SnapshotFileInput } from './SnapshotFileInput';
import { TableSource } from './TableSource';
import { DictionaryReader } from './DictionaryReader';
import { buildDictionary } from './dictionary';
import { PublishPanel } from '@/components/publications/PublishPanel';

export function SnapshotRefreshTool() {
  const { t, i18n } = useTranslation();
  const [baseline, setBaseline] = useState<DeliverySnapshot | null>(null);
  const [incoming, setIncoming] = useState<PersistedState[]>([]);

  const result = useMemo(() => {
    if (!baseline || !incoming.length) return null;

    try {
      const refreshed = refreshSchemaSnapshot(baseline.tables, incoming);

      return {
        ...refreshed,
        comparison: compareSchemaSnapshots(baseline.tables, refreshed.tables),
        error: '',
      };
    } catch (cause) {
      return {
        comparison: null,
        tables: [],
        warnings: [],
        added: [],
        removed: [],
        error: cause instanceof Error ? cause.message : t('schemaTools.failed'),
      };
    }
  }, [baseline, incoming, t]);

  return (
    <ToolLayout title={t('snapshot.refresh')} description={t('snapshot.hint')}>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <SnapshotFileInput label={t('snapshot.baseline')} onChange={setBaseline} />
          {baseline && (
            <p role="status" className="mt-2 text-sm">
              {t('snapshot.tables', { count: baseline.tables.length })}
            </p>
          )}
        </div>
        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t('snapshot.incoming')}</h3>
          <TableSource value={incoming} onChange={setIncoming} />
        </section>
      </div>
      {result?.error && (
        <p role="alert" className="text-sm text-destructive">
          {result.error}
        </p>
      )}
      {result && !result.error && baseline && (
        <>
          <p className="text-sm">
            {t('snapshot.changes', {
              added: result.added.join(', ') || '—',
              removed: result.removed.join(', ') || '—',
            })}
          </p>
          {result.warnings.length > 0 && (
            <p role="alert" className="whitespace-pre-wrap text-sm">
              {result.warnings.join('\n')}
            </p>
          )}
          {result.comparison && <ComparisonDetails comparison={result.comparison} />}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!result.comparison}
              onClick={() => {
                if (result.comparison)
                  downloadFile(
                    comparisonMarkdown(result.comparison, t),
                    'schema-refresh-report.md',
                    'text/markdown',
                  );
              }}
            >
              {t('schemaTools.compare.exportReport')}
            </Button>
            <Button
              onClick={() =>
                downloadFile(
                  encodeDeliverySnapshot({ tables: result.tables, standards: baseline.standards }),
                  'refreshed-schema.json',
                  'application/json',
                )
              }
            >
              {t('snapshot.exportRefreshed')}
            </Button>
          </div>
          <PublishPanel
            title={t('publication.document')}
            content={{ kind: 'document', tables: result.tables, standards: baseline.standards }}
          />
          <DictionaryReader
            document={buildDictionary(result.tables, baseline.standards, '', i18n.language, t)}
          />
        </>
      )}
    </ToolLayout>
  );
}
