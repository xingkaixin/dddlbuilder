import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PersistedState } from '@ddlbuilder/shared-types';
import {
  buildSelectQuery,
  getQueryRelations,
  QUERY_AGGREGATES,
  QUERY_OPERATORS,
  snapshotTableKey,
  snapshotTableLabel,
  type QueryDesign,
  type QueryField,
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

function QueryFields({
  tables,
  value,
  label,
  onChange,
}: {
  tables: PersistedState[];
  value: QueryField;
  label: string;
  onChange: (field: QueryField) => void;
}) {
  const choices = tables.flatMap((table) =>
    table.rows.map((row) => ({
      table: snapshotTableKey(table),
      field: row.fieldName,
      label: `${snapshotTableLabel(table)}.${row.fieldName}`,
    })),
  );

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
      <option value={fieldKey({ table: value.table, field: '*' })}>COUNT(*)</option>
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
  const [tables, setTables] = useState<PersistedState[]>([]);
  const [design, setDesign] = useState<QueryDesign>(emptyDesign);
  let error = '';
  let relations: ReturnType<typeof getQueryRelations> = [];
  let result: ReturnType<typeof buildSelectQuery> | null = null;

  try {
    if (tables.length) relations = getQueryRelations(tables);

    if (design.root) result = buildSelectQuery(tables, design);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : t('schemaTools.failed');
  }

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
    field: joinedTables[0]?.rows[0]?.fieldName ?? '*',
  };
  const candidates = relations.filter(
    (relation) => joined.has(relation.from) !== joined.has(relation.to),
  );

  return (
    <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-4 md:border-r md:pr-5">
        <h2 className="font-semibold">{t('modelTools.query')}</h2>
        <p className="text-sm text-muted-foreground">{t('modelTools.queryHint')}</p>
        <TableSource
          value={tables}
          onChange={(value) => {
            setTables(value);
            setDesign(emptyDesign());
          }}
        />
      </div>
      <div className="min-w-0 space-y-5">
        <label className="grid gap-2 text-sm">
          <span>{t('modelTools.root')}</span>
          <select
            className={selectClass}
            value={design.root}
            onChange={(event) => setDesign({ ...emptyDesign(), root: event.target.value })}
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
                        setDesign({
                          ...design,
                          joins: design.joins.map((item, i) =>
                            i === index
                              ? { ...item, type: event.target.value === 'LEFT' ? 'LEFT' : 'INNER' }
                              : item,
                          ),
                        })
                      }
                    >
                      <option>INNER</option>
                      <option>LEFT</option>
                    </select>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setDesign({
                          ...emptyDesign(),
                          root: design.root,
                          joins: design.joins.slice(0, index),
                        })
                      }
                    >
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
                    setDesign({
                      ...design,
                      joins: [...design.joins, { relation: event.target.value, type: 'INNER' }],
                    });
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
                    label={t('modelTools.column', { index: index + 1 })}
                    onChange={(value) =>
                      setDesign({
                        ...design,
                        columns: design.columns.map((item, i) =>
                          i === index
                            ? {
                                ...item,
                                ...value,
                                aggregate: value.field === '*' ? 'COUNT' : item.aggregate,
                              }
                            : item,
                        ),
                      })
                    }
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
                        setDesign({
                          ...design,
                          columns: design.columns.map((item, i) =>
                            i === index ? { ...item, aggregate } : item,
                          ),
                        });
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
                      setDesign({
                        ...design,
                        columns: design.columns.map((item, i) =>
                          i === index ? { ...item, alias: event.target.value } : item,
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDesign({
                        ...design,
                        columns: design.columns.filter((_, i) => i !== index),
                        orderBy: [],
                      })
                    }
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setDesign({
                    ...design,
                    columns: [...design.columns, { ...firstField, aggregate: '', alias: '' }],
                  })
                }
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
                    onChange={(value) =>
                      setDesign({
                        ...design,
                        filters: design.filters.map((item, i) =>
                          i === index ? { ...item, ...value } : item,
                        ),
                      })
                    }
                  />
                  <select
                    className={selectClass}
                    aria-label={t('modelTools.operator', { index: index + 1 })}
                    value={filter.operator}
                    onChange={(event) => {
                      const operator = QUERY_OPERATORS.find(
                        (value) => value === event.target.value,
                      );

                      if (operator)
                        setDesign({
                          ...design,
                          filters: design.filters.map((item, i) =>
                            i === index ? { ...item, operator } : item,
                          ),
                        });
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
                        setDesign({
                          ...design,
                          filters: design.filters.map((item, i) =>
                            i === index ? { ...item, value: event.target.value } : item,
                          ),
                        })
                      }
                    />
                  )}
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDesign({
                        ...design,
                        filters: design.filters.filter((_, i) => i !== index),
                      })
                    }
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                onClick={() =>
                  setDesign({
                    ...design,
                    filters: [...design.filters, { ...firstField, operator: '=', value: '' }],
                  })
                }
              >
                {t('modelTools.addFilter')}
              </Button>
            </section>
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold">GROUP BY</legend>
              {joinedTables.flatMap((table) =>
                table.rows.map((row) => {
                  const field = { table: snapshotTableKey(table), field: row.fieldName };
                  const checked = design.groupBy.some((item) => fieldKey(item) === fieldKey(field));

                  return (
                    <label key={fieldKey(field)} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setDesign({
                            ...design,
                            groupBy: checked
                              ? design.groupBy.filter((item) => fieldKey(item) !== fieldKey(field))
                              : [...design.groupBy, field],
                          })
                        }
                      />
                      {snapshotTableLabel(table)}.{row.fieldName}
                    </label>
                  );
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
                      setDesign({
                        ...design,
                        orderBy: design.orderBy.map((item, i) =>
                          i === index ? { ...item, column: Number(event.target.value) } : item,
                        ),
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
                      setDesign({
                        ...design,
                        orderBy: design.orderBy.map((item, i) =>
                          i === index
                            ? { ...item, direction: event.target.value === 'DESC' ? 'DESC' : 'ASC' }
                            : item,
                        ),
                      })
                    }
                  >
                    <option>ASC</option>
                    <option>DESC</option>
                  </select>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setDesign({
                        ...design,
                        orderBy: design.orderBy.filter((_, i) => i !== index),
                      })
                    }
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                disabled={!design.columns.length}
                onClick={() =>
                  setDesign({
                    ...design,
                    orderBy: [...design.orderBy, { column: 0, direction: 'ASC' }],
                  })
                }
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
                onChange={(event) => setDesign({ ...design, limit: Number(event.target.value) })}
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
      </div>
    </div>
  );
}
