import { ToolLayout } from './ToolLayout';
import { useMemo, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  buildSelectQuery,
  getQueryRelations,
  QUERY_AGGREGATES,
  QUERY_OPERATORS,
  snapshotTableKey,
  snapshotTableLabel,
  type QueryColumn,
  type QueryDesign,
  type QueryField,
  type QueryFilter,
} from '@ddlbuilder/ddl-core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadFile } from '@/utils/mockDataGenerator';
import { copyText } from '@/utils/clipboard';
import { toast } from 'sonner';
import { TableSource } from './TableSource';

const selectClass = 'h-9 min-w-0 rounded-md border bg-background px-2 text-sm';
const emptyDesign = (): QueryDesign => ({
  root: '',
  joins: [],
  columns: [],
  filters: [],
  groupBy: [],
  orderBy: [],
  limit: 100,
});
const fieldKey = (field: QueryField) => JSON.stringify([field.table, field.field]);

type DesignerState = { tables: PersistedState[]; design: QueryDesign };

type DesignEvent =
  | { type: 'rootChosen'; root: string }
  | { type: 'joinAdded'; relation: string }
  | { type: 'joinTypeChosen'; index: number; joinType: QueryDesign['joins'][number]['type'] }
  | { type: 'joinRemoved'; index: number }
  | { type: 'columnAdded'; field: QueryField }
  | { type: 'columnFieldChosen'; index: number; field: QueryField }
  | {
      type: 'columnChanged';
      index: number;
      patch: Partial<Pick<QueryColumn, 'aggregate' | 'alias'>>;
    }
  | { type: 'columnRemoved'; index: number }
  | { type: 'filterAdded'; field: QueryField }
  | {
      type: 'filterChanged';
      index: number;
      patch: Partial<Pick<QueryFilter, 'table' | 'field' | 'operator' | 'value'>>;
    }
  | { type: 'filterRemoved'; index: number }
  | { type: 'groupByToggled'; field: QueryField }
  | { type: 'orderAdded' }
  | { type: 'orderChanged'; index: number; patch: Partial<QueryDesign['orderBy'][number]> }
  | { type: 'orderRemoved'; index: number }
  | { type: 'limitChanged'; limit: number };

type DesignerEvent = DesignEvent | { type: 'tablesSelected'; tables: PersistedState[] };

const replaceAt = <Item,>(items: Item[], index: number, update: (item: Item) => Item) =>
  items.map((item, i) => (i === index ? update(item) : item));

function designReducer(design: QueryDesign, event: DesignEvent): QueryDesign {
  switch (event.type) {
    case 'rootChosen':
      return { ...emptyDesign(), root: event.root };
    case 'joinAdded':
      return { ...design, joins: [...design.joins, { relation: event.relation, type: 'INNER' }] };
    case 'joinTypeChosen':
      return {
        ...design,
        joins: replaceAt(design.joins, event.index, (join) => ({ ...join, type: event.joinType })),
      };
    case 'joinRemoved':
      return { ...emptyDesign(), root: design.root, joins: design.joins.slice(0, event.index) };
    case 'columnAdded':
      return {
        ...design,
        columns: [...design.columns, { ...event.field, aggregate: '', alias: '' }],
      };
    case 'columnFieldChosen':
      return {
        ...design,
        columns: replaceAt(design.columns, event.index, (column) => ({
          ...column,
          ...event.field,
          aggregate: event.field.field === '*' ? 'COUNT' : column.aggregate,
        })),
      };
    case 'columnChanged':
      return {
        ...design,
        columns: replaceAt(design.columns, event.index, (column) => ({
          ...column,
          ...event.patch,
        })),
      };
    case 'columnRemoved':
      return {
        ...design,
        columns: design.columns.filter((_, i) => i !== event.index),
        orderBy: [],
      };
    case 'filterAdded':
      return {
        ...design,
        filters: [...design.filters, { ...event.field, operator: '=', value: '' }],
      };
    case 'filterChanged':
      return {
        ...design,
        filters: replaceAt(design.filters, event.index, (filter) => ({
          ...filter,
          ...event.patch,
        })),
      };
    case 'filterRemoved':
      return { ...design, filters: design.filters.filter((_, i) => i !== event.index) };
    case 'groupByToggled': {
      const key = fieldKey(event.field);
      const checked = design.groupBy.some((item) => fieldKey(item) === key);

      return {
        ...design,
        groupBy: checked
          ? design.groupBy.filter((item) => fieldKey(item) !== key)
          : [...design.groupBy, event.field],
      };
    }

    case 'orderAdded':
      return { ...design, orderBy: [...design.orderBy, { column: 0, direction: 'ASC' }] };
    case 'orderChanged':
      return {
        ...design,
        orderBy: replaceAt(design.orderBy, event.index, (order) => ({ ...order, ...event.patch })),
      };
    case 'orderRemoved':
      return { ...design, orderBy: design.orderBy.filter((_, i) => i !== event.index) };
    case 'limitChanged':
      return { ...design, limit: event.limit };
  }
}

function designerReducer(state: DesignerState, event: DesignerEvent): DesignerState {
  if (event.type === 'tablesSelected') return { tables: event.tables, design: emptyDesign() };

  return { ...state, design: designReducer(state.design, event) };
}

const createDesignerState = (): DesignerState => ({ tables: [], design: emptyDesign() });

function QueryFields({
  tables,
  value,
  label,
  allowCount = false,
  onChange,
}: {
  tables: PersistedState[];
  value: QueryField;
  label: string;
  allowCount?: boolean;
  onChange: (field: QueryField) => void;
}) {
  const choices = tables.flatMap((table) =>
    table.rows.flatMap((row) =>
      row.fieldName.trim()
        ? [
            {
              table: snapshotTableKey(table),
              field: row.fieldName,
              label: `${snapshotTableLabel(table)}.${row.fieldName}`,
            },
          ]
        : [],
    ),
  );

  if (allowCount) choices.unshift({ table: value.table, field: '*', label: 'COUNT(*)' });

  return (
    <select
      className={selectClass}
      aria-label={label}
      value={fieldKey(value)}
      onChange={(event) => {
        const chosen = choices.find((item) => fieldKey(item) === event.target.value);

        if (chosen) onChange({ table: chosen.table, field: chosen.field });
      }}
    >
      {choices.map((item) => (
        <option key={fieldKey(item)} value={fieldKey(item)}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

export function QueryDesignerTool() {
  const { t } = useTranslation();

  const [{ tables, design }, dispatch] = useReducer(
    designerReducer,
    undefined,
    createDesignerState,
  );

  const relationState = useMemo(() => {
    try {
      return { relations: tables.length ? getQueryRelations(tables) : [], error: '' };
    } catch (cause) {
      return {
        relations: [],
        error: cause instanceof Error ? cause.message : t('schemaTools.failed'),
      };
    }
  }, [tables, t]);
  const queryState = useMemo(() => {
    if (relationState.error || !design.root) return { result: null, error: relationState.error };

    try {
      return { result: buildSelectQuery(tables, design), error: '' };
    } catch (cause) {
      return {
        result: null,
        error: cause instanceof Error ? cause.message : t('schemaTools.failed'),
      };
    }
  }, [design, relationState.error, tables, t]);
  const { relations } = relationState;
  const { result, error } = queryState;

  const joined = new Set([design.root]);

  for (const join of design.joins) {
    const relation = relations.find((item) => item.id === join.relation);

    if (relation) {
      joined.add(relation.from);
      joined.add(relation.to);
    }
  }

  const joinedTables = tables.filter((table) => joined.has(snapshotTableKey(table)));

  const firstField: QueryField = {
    table: design.root,
    field:
      joinedTables.find((table) => snapshotTableKey(table) === design.root)?.rows[0]?.fieldName ??
      '*',
  };
  const candidates = relations.filter(
    (relation) => joined.has(relation.from) !== joined.has(relation.to),
  );

  return (
    <ToolLayout
      title={t('modelTools.query')}
      description={t('modelTools.queryHint')}
      source={
        <TableSource
          value={tables}
          onChange={(value) => dispatch({ type: 'tablesSelected', tables: value })}
        />
      }
    >
      <label className="grid gap-2 text-sm">
        <span>{t('modelTools.root')}</span>
        <select
          className={selectClass}
          value={design.root}
          onChange={(event) => dispatch({ type: 'rootChosen', root: event.target.value })}
        >
          <option value="">{t('modelTools.choose')}</option>
          {tables.map((table) => (
            <option key={snapshotTableKey(table)} value={snapshotTableKey(table)}>
              {snapshotTableLabel(table)}
            </option>
          ))}
        </select>
      </label>
      {design.root && (
        <>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{t('modelTools.joins')}</h3>
            {design.joins.map((join, index) => {
              const relation = relations.find((item) => item.id === join.relation);

              return (
                <div key={index} className="flex flex-wrap items-center gap-2 rounded border p-2">
                  <span className="break-all text-sm">{relation?.name}</span>
                  <select
                    className={selectClass}
                    aria-label={t('modelTools.joinType', { index: index + 1 })}
                    value={join.type}
                    onChange={(event) =>
                      dispatch({
                        type: 'joinTypeChosen',
                        index,
                        joinType: event.target.value === 'LEFT' ? 'LEFT' : 'INNER',
                      })
                    }
                  >
                    <option>INNER</option>
                    <option>LEFT</option>
                  </select>
                  <Button variant="ghost" onClick={() => dispatch({ type: 'joinRemoved', index })}>
                    {t('modelTools.removeJoin')}
                  </Button>
                </div>
              );
            })}
            <select
              className={`${selectClass} w-full`}
              aria-label={t('modelTools.addJoin')}
              value=""
              onChange={(event) => {
                if (event.target.value)
                  dispatch({ type: 'joinAdded', relation: event.target.value });
              }}
            >
              <option value="">{t('modelTools.addJoin')}</option>
              {candidates.map((relation) => (
                <option key={relation.id} value={relation.id}>
                  {relation.name} ·{' '}
                  {tables.find((table) => snapshotTableKey(table) === relation.from)?.tableName} →{' '}
                  {tables.find((table) => snapshotTableKey(table) === relation.to)?.tableName}
                  {relation.logical ? ` (${t('modelTools.logical')})` : ''}
                </option>
              ))}
            </select>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t('modelTools.columns')}</h3>
            {design.columns.map((column, index) => (
              <div key={index} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                <QueryFields
                  tables={joinedTables}
                  value={column}
                  allowCount
                  label={t('modelTools.column', { index: index + 1 })}
                  onChange={(value) => dispatch({ type: 'columnFieldChosen', index, field: value })}
                />
                <select
                  className={selectClass}
                  aria-label={t('modelTools.aggregate', { index: index + 1 })}
                  value={column.aggregate}
                  onChange={(event) => {
                    const aggregate = QUERY_AGGREGATES.find(
                      (value) => value === event.target.value,
                    );

                    if (aggregate !== undefined)
                      dispatch({ type: 'columnChanged', index, patch: { aggregate } });
                  }}
                >
                  {QUERY_AGGREGATES.map((value) => (
                    <option key={value} value={value}>
                      {value || t('modelTools.noAggregate')}
                    </option>
                  ))}
                </select>
                <Input
                  aria-label={t('modelTools.alias', { index: index + 1 })}
                  placeholder={t('modelTools.alias', { index: index + 1 })}
                  value={column.alias}
                  onChange={(event) =>
                    dispatch({ type: 'columnChanged', index, patch: { alias: event.target.value } })
                  }
                />
                <Button variant="ghost" onClick={() => dispatch({ type: 'columnRemoved', index })}>
                  {t('common.delete')}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => dispatch({ type: 'columnAdded', field: firstField })}
            >
              {t('modelTools.addColumn')}
            </Button>
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{t('modelTools.filters')}</h3>
            {design.filters.map((filter, index) => (
              <div key={index} className="grid gap-2 rounded border p-3 sm:grid-cols-2">
                <QueryFields
                  tables={joinedTables}
                  value={filter}
                  label={t('modelTools.filterField', { index: index + 1 })}
                  onChange={(value) => dispatch({ type: 'filterChanged', index, patch: value })}
                />
                <select
                  className={selectClass}
                  aria-label={t('modelTools.operator', { index: index + 1 })}
                  value={filter.operator}
                  onChange={(event) => {
                    const operator = QUERY_OPERATORS.find((value) => value === event.target.value);

                    if (operator) dispatch({ type: 'filterChanged', index, patch: { operator } });
                  }}
                >
                  {QUERY_OPERATORS.map((operator) => (
                    <option key={operator}>{operator}</option>
                  ))}
                </select>
                {!filter.operator.startsWith('IS ') && (
                  <Input
                    aria-label={t('modelTools.value', { index: index + 1 })}
                    value={filter.value}
                    onChange={(event) =>
                      dispatch({
                        type: 'filterChanged',
                        index,
                        patch: { value: event.target.value },
                      })
                    }
                  />
                )}
                <Button variant="ghost" onClick={() => dispatch({ type: 'filterRemoved', index })}>
                  {t('common.delete')}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => dispatch({ type: 'filterAdded', field: firstField })}
            >
              {t('modelTools.addFilter')}
            </Button>
          </section>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">GROUP BY</legend>
            {joinedTables.flatMap((table) =>
              table.rows.flatMap((row) => {
                if (!row.fieldName.trim()) return [];

                const field = { table: snapshotTableKey(table), field: row.fieldName };
                const checked = design.groupBy.some((item) => fieldKey(item) === fieldKey(field));

                return [
                  <label key={fieldKey(field)} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => dispatch({ type: 'groupByToggled', field })}
                    />
                    {snapshotTableLabel(table)}.{row.fieldName}
                  </label>,
                ];
              }),
            )}
          </fieldset>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">ORDER BY</h3>
            {design.orderBy.map((order, index) => (
              <div key={index} className="flex flex-wrap gap-2">
                <select
                  className={selectClass}
                  aria-label={t('modelTools.orderColumn', { index: index + 1 })}
                  value={order.column}
                  onChange={(event) =>
                    dispatch({
                      type: 'orderChanged',
                      index,
                      patch: { column: Number(event.target.value) },
                    })
                  }
                >
                  {design.columns.map((column, i) => (
                    <option key={i} value={i}>
                      {column.alias || `column_${i + 1}`}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  aria-label={t('modelTools.direction', { index: index + 1 })}
                  value={order.direction}
                  onChange={(event) =>
                    dispatch({
                      type: 'orderChanged',
                      index,
                      patch: { direction: event.target.value === 'DESC' ? 'DESC' : 'ASC' },
                    })
                  }
                >
                  <option>ASC</option>
                  <option>DESC</option>
                </select>
                <Button variant="ghost" onClick={() => dispatch({ type: 'orderRemoved', index })}>
                  {t('common.delete')}
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              disabled={!design.columns.length}
              onClick={() => dispatch({ type: 'orderAdded' })}
            >
              {t('modelTools.addOrder')}
            </Button>
          </section>
          <label htmlFor="query-limit" className="grid max-w-40 gap-2 text-sm">
            LIMIT
            <Input
              type="number"
              id="query-limit"
              min={1}
              max={10000}
              value={design.limit}
              onChange={(event) =>
                dispatch({ type: 'limitChanged', limit: Number(event.target.value) })
              }
            />
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <>
          <pre
            className="max-h-96 overflow-auto rounded bg-muted p-4 text-xs"
            aria-label={t('modelTools.querySql')}
          >
            {result.sql}
          </pre>
          <pre
            className="overflow-auto rounded bg-muted p-3 text-xs"
            aria-label={t('modelTools.parameters')}
          >
            {JSON.stringify(result.parameters, null, 2)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                if (await copyText(result.sql)) toast.success(t('modelTools.copied'));
              }}
            >
              {t('modelTools.copy')}
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadFile(result.sql, 'query.sql', 'text/plain')}
            >
              {t('modelTools.downloadSql')}
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                downloadFile(
                  JSON.stringify(result.parameters, null, 2),
                  'parameters.json',
                  'application/json',
                )
              }
            >
              {t('modelTools.downloadParameters')}
            </Button>
          </div>
        </>
      )}
    </ToolLayout>
  );
}
