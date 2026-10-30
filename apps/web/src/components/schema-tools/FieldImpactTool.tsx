import { ToolLayout } from './ToolLayout';
import { useReducer } from 'react';
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

type ImpactState = { tables: PersistedState[]; tableKey: string; field: string };

type ImpactEvent =
  | { type: 'tablesSelected'; tables: PersistedState[] }
  | { type: 'tableChosen'; tableKey: string }
  | { type: 'fieldChosen'; field: string };

const initialImpactState: ImpactState = { tables: [], tableKey: '', field: '' };

function impactReducer(state: ImpactState, event: ImpactEvent): ImpactState {
  switch (event.type) {
    case 'tablesSelected':
      return { tables: event.tables, tableKey: '', field: '' };
    case 'tableChosen':
      return { ...state, tableKey: event.tableKey, field: '' };
    case 'fieldChosen':
      return { ...state, field: event.field };
  }
}

export function FieldImpactTool() {
  const { t } = useTranslation();
  const [{ tables, tableKey, field }, dispatch] = useReducer(impactReducer, initialImpactState);
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
    <ToolLayout
      title={t('modelTools.impact')}
      description={t('modelTools.impactHint')}
      source={
        <TableSource
          value={tables}
          onChange={(next) => dispatch({ type: 'tablesSelected', tables: next })}
        />
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span>{t('modelTools.impactTable')}</span>
          <select
            className="h-9 w-full rounded-md border bg-background px-3"
            value={tableKey}
            onChange={(event) => dispatch({ type: 'tableChosen', tableKey: event.target.value })}
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
            onChange={(event) => dispatch({ type: 'fieldChosen', field: event.target.value })}
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
    </ToolLayout>
  );
}
