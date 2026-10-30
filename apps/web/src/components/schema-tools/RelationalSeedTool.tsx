import { ToolLayout } from './ToolLayout';
import { SeedScenarioPanel } from './SeedScenarioPanel';
import type { SeedRule, SeedScenario } from '@ddlbuilder/shared-types/api';
import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  generateRelationalSeed,
  snapshotTableKey,
  snapshotTableLabel,
  type RelationalSeedResult,
} from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadFile } from '@/utils/mockDataGenerator';
import { TableSource } from './TableSource';

type SeedOutcome =
  | { status: 'idle' }
  | { status: 'generated'; result: RelationalSeedResult }
  | { status: 'failed'; error: string };

type SeedState = {
  tables: PersistedState[];
  counts: Map<string, number>;
  seed: string;
  scenarioName: string;
  rules: readonly SeedRule[];
  includeLogical: boolean;
  outcome: SeedOutcome;
};

type SeedEvent =
  | { type: 'tablesSelected'; tables: PersistedState[] }
  | { type: 'seedChanged'; seed: string }
  | { type: 'includeLogicalChanged'; includeLogical: boolean }
  | { type: 'rowCountChanged'; tableKey: string; count: number }
  | { type: 'scenarioApplied'; scenario: SeedScenario }
  | { type: 'generated'; result: RelationalSeedResult }
  | { type: 'generationFailed'; error: string };

const idle: SeedOutcome = { status: 'idle' };

const initialSeedState: SeedState = {
  tables: [],
  counts: new Map(),
  seed: 'ddlbuilder',
  scenarioName: '',
  rules: [],
  includeLogical: false,
  outcome: idle,
};

function seedReducer(state: SeedState, event: SeedEvent): SeedState {
  switch (event.type) {
    case 'tablesSelected':
      return { ...state, tables: event.tables, outcome: idle };
    case 'seedChanged':
      return { ...state, seed: event.seed, outcome: idle };
    case 'includeLogicalChanged':
      return { ...state, includeLogical: event.includeLogical, outcome: idle };
    case 'rowCountChanged':
      return {
        ...state,
        counts: new Map(state.counts).set(event.tableKey, event.count),
        outcome: idle,
      };
    case 'scenarioApplied':
      return {
        ...state,
        scenarioName: event.scenario.name,
        seed: event.scenario.seed,
        includeLogical: event.scenario.includeLogical,
        counts: new Map(event.scenario.rows.map((row) => [row.tableKey, row.count])),
        rules: event.scenario.rules,
        outcome: idle,
      };
    case 'generated':
      return { ...state, outcome: { status: 'generated', result: event.result } };
    case 'generationFailed':
      return { ...state, outcome: { status: 'failed', error: event.error } };
  }
}

export function RelationalSeedTool() {
  const { t } = useTranslation();

  const [{ tables, counts, seed, scenarioName, rules, includeLogical, outcome }, dispatch] =
    useReducer(seedReducer, initialSeedState);
  const result = outcome.status === 'generated' ? outcome.result : null;
  const error = outcome.status === 'failed' ? outcome.error : '';
  const total = tables.reduce((sum, table) => sum + (counts.get(snapshotTableKey(table)) ?? 10), 0);

  return (
    <ToolLayout
      title={t('schemaTools.seed.title')}
      description={t('schemaTools.seed.hint')}
      source={
        <TableSource
          value={tables}
          onChange={(value) => dispatch({ type: 'tablesSelected', tables: value })}
        />
      }
    >
      <label className="block space-y-2 text-sm font-medium">
        <span>{t('schemaTools.seed.seed')}</span>
        <Input
          value={seed}
          maxLength={200}
          onChange={(event) => dispatch({ type: 'seedChanged', seed: event.target.value })}
        />
      </label>
      <p className="text-xs text-muted-foreground">{t('schemaTools.seed.seedHint')}</p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeLogical}
          onChange={(event) =>
            dispatch({ type: 'includeLogicalChanged', includeLogical: event.target.checked })
          }
        />
        {t('schemaTools.seed.logical')}
      </label>
      <div className="space-y-2">
        {tables.map((table, index) => (
          <label
            key={index}
            className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <span className="min-w-0 break-words">{snapshotTableLabel(table)}</span>
            <Input
              type="number"
              min={1}
              max={1000}
              className="w-24 shrink-0"
              aria-label={t('schemaTools.seed.rowsFor', { name: snapshotTableLabel(table) })}
              value={counts.get(snapshotTableKey(table)) ?? 10}
              onChange={(event) =>
                dispatch({
                  type: 'rowCountChanged',
                  tableKey: snapshotTableKey(table),
                  count: Number(event.target.value),
                })
              }
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t('schemaTools.seed.limit', { count: total })}
      </p>
      <SeedScenarioPanel
        tables={tables}
        value={{
          version: 1,
          name: scenarioName,
          seed,
          includeLogical,
          rows: tables.map((table) => ({
            tableKey: snapshotTableKey(table),
            count: counts.get(snapshotTableKey(table)) ?? 10,
          })),
          rules,
        }}
        onChange={(scenario) => dispatch({ type: 'scenarioApplied', scenario })}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!tables.length || total > 10000}
          onClick={() => {
            try {
              dispatch({
                type: 'generated',
                result: generateRelationalSeed(
                  tables.map((table) => ({
                    table,
                    rowCount: counts.get(snapshotTableKey(table)) ?? 10,
                  })),
                  seed,
                  includeLogical,
                  rules,
                ),
              });
            } catch (cause) {
              dispatch({
                type: 'generationFailed',
                error: cause instanceof Error ? cause.message : t('schemaTools.failed'),
              });
            }
          }}
        >
          {t('schemaTools.seed.generate')}
        </Button>
        <Button
          variant="outline"
          disabled={!result}
          onClick={() => {
            if (result)
              downloadFile(result.sql, 'relational-test-data.sql', 'text/plain;charset=utf-8');
          }}
        >
          {t('schemaTools.seed.exportSql')}
        </Button>
        <Button
          variant="outline"
          disabled={!result}
          onClick={() => {
            if (result)
              downloadFile(
                result.json,
                'relational-test-data.json',
                'application/json;charset=utf-8',
              );
          }}
        >
          {t('schemaTools.seed.exportJson')}
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="whitespace-pre-wrap break-words rounded-md border border-destructive/40 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!tables.length && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {t('schemaTools.seed.empty')}
        </p>
      )}
      {result && (
        <>
          <p role="status" className="text-sm">
            {t('schemaTools.seed.success', { tables: result.tables.length, rows: total })}
          </p>
          <p className="text-xs text-muted-foreground">{t('schemaTools.seed.outputHint')}</p>
          {result.tables.map((table) => (
            <section key={table.name} className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-medium">
                {table.name} · {t('schemaTools.seed.rows', { count: table.rows.length })}
              </h3>
              <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
                {JSON.stringify(table.rows.slice(0, 5), null, 2)}
              </pre>
            </section>
          ))}
          <details>
            <summary className="cursor-pointer text-sm">{t('schemaTools.seed.previewSql')}</summary>
            <pre className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
              {result.sql.slice(0, 12000)}
            </pre>
          </details>
        </>
      )}
    </ToolLayout>
  );
}
