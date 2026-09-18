import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  analyzeFieldImpact,
  impactFieldNames,
  snapshotTableKey,
  snapshotTableLabel,
} from '@ddlbuilder/ddl-core';
import { TableSource } from './TableSource';
import { Button } from '@/components/ui/button';
import { downloadFile } from '@/utils/mockDataGenerator';

export function FieldImpactTool() {
  const { t } = useTranslation();
  const [tables, setTables] = useState<PersistedState[]>([]);
  const [tableKey, setTableKey] = useState('');
  const [field, setField] = useState('');
  const selected = tables.find((table) => snapshotTableKey(table) === tableKey);
  let report: ReturnType<typeof analyzeFieldImpact> | null = null;
  let error = '';

  try {
    if (tableKey && field) report = analyzeFieldImpact(tables, tableKey, field);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : t('schemaTools.failed');
  }

  const describe = (dependency: NonNullable<typeof report>['dependencies'][number]) =>
    [
      t(`modelTools.impactKinds.${dependency.kind}`),
      `${dependency.table}.${dependency.name}: (${dependency.fields.join(', ')})`,
      dependency.relatedTable &&
        `→ ${dependency.relatedTable} (${dependency.relatedFields?.join(', ')})`,
      dependency.direction && t(`modelTools.${dependency.direction}`),
      dependency.detail,
    ]
      .filter(Boolean)
      .join(' · ');
  const scope = report
    ? t('modelTools.impactScope', {
        count: report.tablesChecked,
        views: report.viewsExcluded.length,
        external: report.externalRelations.length,
      })
    : '';
  const markdown = report
    ? [
        `# ${t('modelTools.impact')}`,
        `${report.table}.${report.field} (${report.dbType})`,
        scope,
        t('modelTools.impactLimits'),
        ...report.dependencies.map((dependency) => `- ${describe(dependency)}`),
        ...report.viewsExcluded.map((view) => `${t('modelTools.excludedView')}: ${view}`),
        ...report.externalRelations.map(
          (relation) => `${t('modelTools.externalRelation')}: ${relation}`,
        ),
      ].join('\n\n')
    : '';

  return (
    <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-4 md:border-r md:pr-5">
        <h2 className="font-semibold">{t('modelTools.impact')}</h2>
        <p className="text-sm text-muted-foreground">{t('modelTools.impactHint')}</p>
        <TableSource
          value={tables}
          onChange={(next) => {
            setTables(next);
            setTableKey('');
            setField('');
          }}
        />
      </div>
      <div className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span>{t('modelTools.impactTable')}</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              value={tableKey}
              onChange={(event) => {
                setTableKey(event.target.value);
                setField('');
              }}
            >
              <option value="">{t('modelTools.choose')}</option>
              {tables.flatMap((table, index) =>
                table.objectType === 'view'
                  ? []
                  : [
                      <option key={index} value={snapshotTableKey(table)}>
                        {snapshotTableLabel(table)}
                      </option>,
                    ],
              )}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span>{t('modelTools.impactField')}</span>
            <select
              className="h-9 w-full rounded-md border bg-background px-3"
              value={field}
              disabled={!selected}
              onChange={(event) => setField(event.target.value)}
            >
              <option value="">{t('modelTools.choose')}</option>
              {selected &&
                impactFieldNames(selected).map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <p className="rounded border p-3 text-sm text-muted-foreground">
          {t('modelTools.impactLimits')}
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {report && (
          <>
            <p role="status" className="text-sm">
              {scope}
            </p>
            <Button onClick={() => downloadFile(markdown, 'field-impact.md', 'text/markdown')}>
              {t('modelTools.impactDownload')}
            </Button>
            {report.dependencies.length ? (
              <ul className="space-y-3">
                {report.dependencies.map((dependency, index) => (
                  <li key={index} className="rounded border p-3 text-sm">
                    <p className="font-medium">
                      {t(`modelTools.impactKinds.${dependency.kind}`)} · {dependency.name}
                    </p>
                    <p className="mt-1 break-words font-mono text-xs">
                      {dependency.table} ({dependency.fields.join(', ')})
                      {dependency.relatedTable && (
                        <>
                          {' '}
                          → {dependency.relatedTable} ({dependency.relatedFields?.join(', ')})
                        </>
                      )}
                    </p>
                    {dependency.direction && (
                      <p className="mt-2 text-muted-foreground">
                        {t(`modelTools.${dependency.direction}`)}
                      </p>
                    )}
                    {dependency.detail && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                        {dependency.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">{t('modelTools.noImpact')}</p>
            )}
            {report.viewsExcluded.map((view, index) => (
              <p key={index} className="break-words text-xs text-muted-foreground">
                {t('modelTools.excludedView')}: {view}
              </p>
            ))}
            {report.externalRelations.map((relation, index) => (
              <p key={index} className="break-words text-xs text-muted-foreground">
                {t('modelTools.externalRelation')}: {relation}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
