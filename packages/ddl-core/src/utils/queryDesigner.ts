import type { PersistedState } from '@ddlbuilder/shared-types';
import { quoteIdentifier } from './databaseFamily';
import { indexSnapshot, snapshotTableKey, snapshotTableLabel } from './schemaSnapshot';
import { getSqlIdentifierKey, unquoteSqlIdentifier } from './sqlIdentifiers';
import { getCanonicalBaseType } from './databaseTypeMapping';

export const QUERY_AGGREGATES = ['', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX'] as const;
export const QUERY_OPERATORS = [
  '=',
  '<>',
  '>',
  '>=',
  '<',
  '<=',
  'LIKE',
  'IS NULL',
  'IS NOT NULL',
] as const;

export interface QueryField {
  table: string;
  field: string;
}

export interface QueryColumn extends QueryField {
  aggregate: (typeof QUERY_AGGREGATES)[number];
  alias: string;
}

export interface QueryFilter extends QueryField {
  operator: (typeof QUERY_OPERATORS)[number];
  value: string;
}

export interface QueryRelation {
  id: string;
  name: string;
  from: string;
  to: string;
  fields: string[];
  refFields: string[];
  logical: boolean;
}

export interface QueryDesign {
  root: string;
  joins: { relation: string; type: 'INNER' | 'LEFT' }[];
  columns: QueryColumn[];
  filters: QueryFilter[];
  groupBy: QueryField[];
  orderBy: { column: number; direction: 'ASC' | 'DESC' }[];
  limit: number;
}

function queryTables(tables: PersistedState[]) {
  const dbType = tables[0]?.dbType;

  if (
    !dbType ||
    !['mysql', 'postgresql'].includes(dbType) ||
    tables.some((table) => table.dbType !== dbType || table.objectType === 'view')
  )
    throw new Error('Select ordinary tables from one MySQL or PostgreSQL database.');
  const indexed = indexSnapshot(tables);

  for (const table of tables) {
    const names = table.rows.flatMap((row) =>
      row.fieldName.trim() ? [getSqlIdentifierKey(row.fieldName, dbType)] : [],
    );

    if (!names.length || new Set(names).size !== names.length)
      throw new Error(`Invalid or duplicate fields: ${snapshotTableLabel(table)}`);
  }

  return indexed;
}

export function getQueryRelations(tables: PersistedState[]): QueryRelation[] {
  const indexed = queryTables(tables);
  const relations: QueryRelation[] = [];

  for (const table of tables) {
    for (const [position, fk] of (table.foreignKeys ?? []).entries()) {
      const target = indexed.get(
        snapshotTableKey(table, fk.refTable, fk.refSchema || table.schemaName),
      );

      if (!target || target === table) continue;

      const hasField = (owner: PersistedState, field: string) =>
        owner.rows.some(
          (row) =>
            getSqlIdentifierKey(row.fieldName, table.dbType) ===
            getSqlIdentifierKey(field, table.dbType),
        );

      if (
        !fk.fields.length ||
        fk.fields.length !== fk.refFields.length ||
        fk.fields.some((name) => !hasField(table, name)) ||
        fk.refFields.some((name) => !hasField(target, name))
      )
        throw new Error(`Invalid relationship: ${snapshotTableLabel(table)}.${fk.name}`);
      relations.push({
        id: JSON.stringify([snapshotTableKey(table), position]),
        name: fk.name,
        from: snapshotTableKey(table),
        to: snapshotTableKey(target),
        fields: fk.fields,
        refFields: fk.refFields,
        logical: Boolean(fk.logical),
      });
    }
  }

  return relations;
}

export function buildSelectQuery(tables: PersistedState[], design: QueryDesign) {
  const indexed = queryTables(tables);
  const root = indexed.get(design.root);

  if (!root) throw new Error('Select a root table.');

  if (!design.columns.length) throw new Error('Select at least one output column.');

  if (!Number.isInteger(design.limit) || design.limit < 1 || design.limit > 10000)
    throw new Error('LIMIT must be an integer between 1 and 10000.');
  const quote = (name: string) => quoteIdentifier(unquoteSqlIdentifier(name.trim()), root.dbType);

  const tableName = (table: PersistedState) =>
    [...(table.schemaName ? [table.schemaName] : []), table.tableName].map(quote).join('.');
  const relations = new Map(getQueryRelations(tables).map((relation) => [relation.id, relation]));
  const aliases = new Map([[design.root, 't1']]);

  const field = (reference: QueryField) => {
    const table = indexed.get(reference.table);
    const alias = aliases.get(reference.table);

    const row = table?.rows.find(
      (candidate) =>
        getSqlIdentifierKey(candidate.fieldName, root.dbType) ===
        getSqlIdentifierKey(reference.field, root.dbType),
    );

    if (!row || !alias) throw new Error(`Unknown or unjoined field: ${reference.field}`);

    return { sql: `${alias}.${quote(row.fieldName)}`, type: getCanonicalBaseType(row.fieldType) };
  };
  const joins: string[] = [];

  for (const join of design.joins) {
    const relation = relations.get(join.relation);

    if (!relation || !['INNER', 'LEFT'].includes(join.type)) throw new Error('Invalid join.');
    const fromJoined = aliases.has(relation.from);
    const toJoined = aliases.has(relation.to);

    if (fromJoined === toJoined)
      throw new Error('Each join must connect one new table to the current query.');
    const next = fromJoined ? relation.to : relation.from;
    const table = indexed.get(next);

    if (!table) throw new Error('Joined table is missing.');
    const alias = `t${aliases.size + 1}`;
    aliases.set(next, alias);

    const predicates = relation.fields.map(
      (name, index) =>
        `${field({ table: relation.from, field: name }).sql} = ${field({ table: relation.to, field: relation.refFields[index] }).sql}`,
    );
    joins.push(`${join.type} JOIN ${tableName(table)} AS ${alias} ON ${predicates.join(' AND ')}`);
  }

  const groups = new Set(design.groupBy.map((item) => field(item).sql));
  const hasAggregate = design.columns.some((column) => column.aggregate);
  const outputNames = new Set<string>();

  const columns = design.columns.map((column, index) => {
    if (!QUERY_AGGREGATES.includes(column.aggregate)) throw new Error('Unsupported aggregate.');

    const reference =
      column.field === '*' && column.aggregate === 'COUNT' ? { sql: '*', type: '' } : field(column);

    if (
      ['SUM', 'AVG'].includes(column.aggregate) &&
      ![
        'int',
        'smallint',
        'tinyint',
        'bigint',
        'decimal',
        'float',
        'double',
        'real',
        'serial',
        'bigserial',
      ].includes(reference.type)
    )
      throw new Error('SUM and AVG require a numeric field.');

    if ((hasAggregate || groups.size > 0) && !column.aggregate && !groups.has(reference.sql))
      throw new Error(`Non-aggregate column must be grouped: ${column.field}`);
    const name = column.alias.trim() || `column_${index + 1}`;
    const key = getSqlIdentifierKey(name, root.dbType);

    if (outputNames.has(key)) throw new Error(`Duplicate output alias: ${name}`);
    outputNames.add(key);
    const expression = column.aggregate ? `${column.aggregate}(${reference.sql})` : reference.sql;

    return `  ${expression} AS ${quote(name)}`;
  });
  const parameters: string[] = [];

  const filters = design.filters.map((filter) => {
    const reference = field(filter);

    if (!QUERY_OPERATORS.includes(filter.operator)) throw new Error('Unsupported filter operator.');

    if (filter.operator.startsWith('IS ')) return `${reference.sql} ${filter.operator}`;

    if (
      filter.operator === 'LIKE' &&
      !['varchar', 'nvarchar', 'char', 'nchar', 'text', 'mediumtext', 'longtext'].includes(
        reference.type,
      )
    )
      throw new Error('LIKE requires a text field.');
    parameters.push(filter.value);

    return `${reference.sql} ${filter.operator} ${root.dbType === 'postgresql' ? `$${parameters.length}` : '?'}`;
  });
  const orders = design.orderBy.map((order) => {
    if (
      !Number.isInteger(order.column) ||
      !design.columns[order.column] ||
      !['ASC', 'DESC'].includes(order.direction)
    )
      throw new Error('Invalid output ordering.');

    return `${order.column + 1} ${order.direction}`;
  });
  const lines = [`SELECT\n${columns.join(',\n')}`, `FROM ${tableName(root)} AS t1`, ...joins];

  if (filters.length) lines.push(`WHERE ${filters.join('\n  AND ')}`);

  if (groups.size) lines.push(`GROUP BY ${[...groups].join(', ')}`);

  if (orders.length) lines.push(`ORDER BY ${orders.join(', ')}`);
  lines.push(`LIMIT ${design.limit};`);

  return { sql: lines.join('\n'), parameters };
}
