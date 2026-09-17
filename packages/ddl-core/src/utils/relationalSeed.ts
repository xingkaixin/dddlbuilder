import type { ForeignKeyDefinition, PersistedState } from '@ddlbuilder/shared-types';
import {
  buildQualifiedTableName,
  parseFieldType,
  getCanonicalBaseType,
} from './databaseTypeMapping.js';
import { formatSqlIdentifier, getSqlIdentifierKey } from './sqlIdentifiers.js';
import { getForeignKeyIssue } from './foreignKeys.js';
import { indexSnapshot, snapshotTableKey, snapshotTableLabel } from './schemaSnapshot.js';
import {
  createSeedColumn,
  seedRandom,
  type SeedColumn,
  type SeedRow,
  type SeedValue,
} from './seedValues.js';

export interface SeedTableInput {
  table: PersistedState;
  rowCount: number;
}

export interface SeedTableData {
  name: string;
  rows: SeedRow[];
}

export interface RelationalSeedResult {
  tables: SeedTableData[];
  sql: string;
  json: string;
}

function sqlValue(value: SeedValue, column: SeedColumn, dbType: PersistedState['dbType']): string {
  if (value === null) return 'NULL';
  if (value === true || value === false) return value ? 'TRUE' : 'FALSE';
  if (column.numeric) return String(value);
  const text = String(value).replaceAll("'", "''");

  return dbType === 'mysql'
    ? `'${text.replaceAll('\\', '\\\\').replaceAll('\0', '\\0')}'`
    : `E'${text.replaceAll('\\', '\\\\')}'`;
}

function keyColumns(table: PersistedState): string[][] {
  return table.indexes.flatMap((index) =>
    index.kind !== 'index' ? [index.fields.map((field) => field.name)] : [],
  );
}

function referenceType(type: string): string {
  const parsed = parseFieldType(type);
  const base = getCanonicalBaseType(parsed.baseType);

  const canonical =
    base === 'serial'
      ? 'int'
      : base === 'smallserial'
        ? 'smallint'
        : base === 'bigserial'
          ? 'bigint'
          : base;

  return JSON.stringify([canonical, parsed.unsigned, parsed.args]);
}

function uniqueKey(values: SeedValue[], mysql: boolean): string {
  return JSON.stringify(
    values.map((value) =>
      value === null
        ? null
        : mysql
          ? String(value).normalize('NFKD').replaceAll(/\p{M}/gu, '').trimEnd().toLowerCase()
          : String(value),
    ),
  );
}

export function generateRelationalSeed(
  inputs: SeedTableInput[],
  seed: string,
  includeLogical = false,
): RelationalSeedResult {
  if (!inputs.length) throw new Error('Select at least one table.');
  const dbType = inputs[0].table.dbType;

  if (
    !['mysql', 'postgresql'].includes(dbType) ||
    inputs.some(({ table }) => table.dbType !== dbType)
  )
    throw new Error('Select tables from one dialect: MySQL or PostgreSQL.');
  const tables = indexSnapshot(inputs.map((input) => input.table));
  const byKey = new Map(inputs.map((input) => [snapshotTableKey(input.table), input]));

  if (inputs.reduce((sum, input) => sum + input.rowCount * input.table.rows.length, 0) > 250000)
    throw new Error(
      'This selection exceeds 250000 cells. Reduce the row counts or select fewer tables.',
    );

  if (
    inputs.some(
      (input) => !Number.isInteger(input.rowCount) || input.rowCount < 1 || input.rowCount > 1000,
    ) ||
    inputs.reduce((sum, input) => sum + input.rowCount, 0) > 10000
  )
    throw new Error('Use 1–1000 rows per table and at most 10000 rows in total.');
  const dependencies = new Map<string, { relation: ForeignKeyDefinition; target: string }[]>();
  const columns = new Map<string, SeedColumn[]>();

  for (const { table } of inputs) {
    const name = snapshotTableLabel(table);

    if (table.objectType === 'view') throw new Error(`${name}: views cannot receive test data.`);
    const fields = table.rows.filter((row) => row.fieldName.trim());

    if (!fields.length) throw new Error(`${name}: no fields.`);
    const fieldKey = (name: string) => getSqlIdentifierKey(name, dbType);
    const fieldsByKey = new Map(fields.map((field) => [fieldKey(field.fieldName), field]));

    if (fieldsByKey.size !== fields.length) throw new Error(`${name}: duplicate fields.`);

    const tableColumns = fields.map((field) =>
      createSeedColumn(field, `${seed}:${snapshotTableKey(table)}`),
    );
    columns.set(snapshotTableKey(table), tableColumns);

    for (const names of keyColumns(table)) {
      if (!names.length || names.some((name) => !fieldsByKey.has(fieldKey(name))))
        throw new Error(`${name}: invalid unique key.`);
    }

    const occupied = new Set<string>();
    const links: { relation: ForeignKeyDefinition; target: string }[] = [];

    for (const relation of table.foreignKeys ?? []) {
      if (relation.logical && !includeLogical) continue;
      const issue = getForeignKeyIssue(relation, dbType);

      if (issue) throw new Error(`${name}.${relation.name}: ${issue.message}`);

      const targetKey = snapshotTableKey(
        table,
        relation.refTable,
        relation.refSchema || table.schemaName,
      );
      const parent = tables.get(targetKey);

      if (!parent)
        throw new Error(`${name}.${relation.name}: include referenced table ${relation.refTable}.`);
      const parentFields = new Map(parent.rows.map((row) => [fieldKey(row.fieldName), row]));

      for (const [index, local] of relation.fields.entries()) {
        const localKey = fieldKey(local);

        if (occupied.has(localKey))
          throw new Error(
            `${name}.${relation.name}: overlapping foreign keys need a custom dataset.`,
          );
        occupied.add(localKey);
        const source = fieldsByKey.get(localKey);
        const target = parentFields.get(fieldKey(relation.refFields[index]));

        if (!source || !target)
          throw new Error(`${name}.${relation.name}: missing referenced field.`);

        if (referenceType(source.fieldType) !== referenceType(target.fieldType))
          throw new Error(`${name}.${relation.name}: use matching source and target types.`);

        if (
          source.enumMeta?.length &&
          JSON.stringify(source.enumMeta.map((entry) => entry.value)) !==
            JSON.stringify(target.enumMeta?.map((entry) => entry.value))
        )
          throw new Error(`${name}.${relation.name}: source and target enumerations differ.`);

        if (source.defaultKind === 'auto_increment')
          throw new Error(
            `${name}.${relation.name}: an auto-increment foreign-key column needs a custom dataset.`,
          );
      }

      if (
        !relation.logical &&
        !keyColumns(parent).some(
          (names) =>
            names.length === relation.refFields.length &&
            names.every((name, index) => fieldKey(name) === fieldKey(relation.refFields[index])),
        )
      )
        throw new Error(
          `${name}.${relation.name}: the referenced fields must form a primary or unique key.`,
        );
      links.push({ relation, target: targetKey });
    }

    dependencies.set(snapshotTableKey(table), links);
  }

  const ordered: string[] = [];
  const pending = new Set(tables.keys());
  const visited = new Set<string>();

  while (pending.size) {
    const ready = [...pending]
      .filter((key) => (dependencies.get(key) ?? []).every((link) => visited.has(link.target)))
      .sort();

    if (!ready.length)
      throw new Error(
        `Cyclic or self-referencing relationships: ${[...pending].map((key) => snapshotTableLabel(tables.get(key) ?? inputs[0].table)).join(', ')}. Use an acyclic selection or a custom dataset.`,
      );

    for (const key of ready) {
      pending.delete(key);
      visited.add(key);
      ordered.push(key);
    }
  }

  const generated = new Map<string, SeedRow[]>();
  const result: SeedTableData[] = [];

  const statements: string[] = [
    '-- Synthetic test data. Import into an empty test database with the matching schema.',
  ];

  for (const key of ordered) {
    const input = byKey.get(key);
    const tableColumns = columns.get(key);

    if (!input || !tableColumns) continue;
    const { table, rowCount } = input;
    const random = seedRandom(`${seed}:${key}`);
    const fieldKey = (name: string) => getSqlIdentifierKey(name, dbType);

    const names = new Map(
      tableColumns.map((column) => [fieldKey(column.field.fieldName), column.field.fieldName]),
    );
    const constraints = keyColumns(table).map((group) =>
      group.map((name) => names.get(fieldKey(name)) ?? name),
    );
    const links = (dependencies.get(key) ?? []).map(({ relation, target }) => {
      const parent = tables.get(target);

      const parentNames = new Map(
        parent?.rows.map((field) => [fieldKey(field.fieldName), field.fieldName]),
      );
      const refFields = relation.refFields.map((name) => parentNames.get(fieldKey(name)) ?? name);
      const localFields = relation.fields.map((name) => names.get(fieldKey(name)) ?? name);

      const rows = (generated.get(target) ?? []).filter((row) =>
        refFields.every((field) => row[field] !== null),
      );
      const unique =
        relation.logical?.cardinality === 'one-to-one' ||
        constraints.some((group) => group.every((name) => localFields.includes(name)));

      if (unique && rowCount > rows.length)
        throw new Error(
          `${snapshotTableLabel(table)}.${relation.name}: ${rowCount} rows require more distinct parent keys than the ${rows.length} available.`,
        );

      if (relation.logical?.cardinality === 'one-to-one') constraints.push(localFields);

      return { refFields, localFields, rows, unique };
    });
    const protectedFields = new Set([
      ...constraints.flat(),
      ...links.flatMap((link) => link.localFields),
    ]);
    const seen = constraints.map(() => new Set<string>());
    const rows: SeedRow[] = [];

    for (let index = 0; index < rowCount; index++) {
      let accepted = false;

      for (let attempt = 0; attempt < 200; attempt++) {
        const ordinal = index + attempt * rowCount;

        const row: SeedRow = Object.fromEntries(
          tableColumns.map((column) => [
            column.field.fieldName,
            column.field.nullable && !protectedFields.has(column.field.fieldName) && random() < 0.1
              ? null
              : column.generate(ordinal),
          ]),
        );
        let combination = index + attempt;

        for (const link of links) {
          const parent =
            link.rows[(link.unique ? index + attempt : combination) % link.rows.length];
          combination = Math.floor(combination / link.rows.length);

          if (!parent)
            throw new Error(`${snapshotTableLabel(table)}: no non-null parent keys available.`);
          link.localFields.forEach((field, position) => {
            row[field] = parent[link.refFields[position]];
          });
        }

        const signatures = constraints.map((group) =>
          uniqueKey(
            group.map((name) => row[name]),
            dbType === 'mysql',
          ),
        );

        if (signatures.some((signature, constraint) => seen[constraint].has(signature))) continue;
        signatures.forEach((signature, constraint) => seen[constraint].add(signature));
        rows.push(row);
        accepted = true;
        break;
      }

      if (!accepted)
        throw new Error(
          `${snapshotTableLabel(table)}: cannot satisfy unique keys after ${rows.length} rows. Reduce the row count or expand the available values.`,
        );
    }

    generated.set(key, rows);
    result.push({ name: snapshotTableLabel(table), rows });
    const tableName = buildQualifiedTableName(table.schemaName, table.tableName, dbType);

    const fieldNames = tableColumns
      .map((column) => formatSqlIdentifier(column.field.fieldName, dbType))
      .join(', ');

    for (const row of rows)
      statements.push(
        `INSERT INTO ${tableName} (${fieldNames}) VALUES (${tableColumns.map((column) => sqlValue(row[column.field.fieldName], column, dbType)).join(', ')});`,
      );
  }

  return { tables: result, sql: statements.join('\n'), json: JSON.stringify(result, null, 2) };
}
