import { getSqlIdentifierKey, unquoteSqlIdentifier } from './sqlIdentifiers';
import { resolveFieldComment } from './fieldComment';
import type { PersistedState, NormalizedField } from '@ddlbuilder/shared-types';
import type { BuildDDLInput } from './ddlGenerators';
import { getCanonicalBaseType, splitQualifiedName } from './databaseTypeMapping';
import { getForeignKeyIssue } from './foreignKeys';
import { snapshotFields } from './schemaSnapshot';
import { SQLITE_TYPE_MAPPINGS } from './sqliteTypes';

const sqlName = (value: string) => unquoteSqlIdentifier(value.trim());
const quote = (value: string) => `"${sqlName(value).replaceAll('"', '""')}"`;
const key = (value: string) => getSqlIdentifierKey(value, 'sqlite');
const codeName = (prefix: string, name: string) =>
  `${prefix}_${name.replace(/[^a-zA-Z0-9]/g, (character) => `_${character.codePointAt(0)?.toString(16)}_`)}`;
const comment = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => `-- ${line}`)
    .join('\n');

function sqliteType(field: NormalizedField): string {
  const canonical = getCanonicalBaseType(field.type);
  const entry = Object.entries(SQLITE_TYPE_MAPPINGS).find(([name]) => name === canonical);

  if (!entry || /\bunsigned\b/i.test(field.type))
    throw new Error(
      `Unsupported SQLite type: ${field.name} (${field.type}). Choose INTEGER, TEXT, REAL, BLOB or NUMERIC explicitly.`,
    );

  return entry[1].mapping.toUpperCase();
}

function sqliteDefault(field: NormalizedField): string {
  const value = field.defaultValue;

  if (field.onUpdate !== 'none' && field.onUpdate)
    throw new Error(`${field.name}: ON UPDATE is not supported.`);

  if (field.defaultKind === 'uuid')
    throw new Error(`${field.name}: provide UUID values in the application.`);

  if (field.defaultKind === 'current_timestamp') return 'CURRENT_TIMESTAMP';

  if (field.defaultKind === 'expression')
    throw new Error(
      `${field.name}: arbitrary default expressions are not supported in SQLite export.`,
    );

  if (field.defaultKind !== 'constant') return '';

  if (value.includes('\0')) throw new Error(`${field.name}: NUL is not supported in defaults.`);
  const type = sqliteType(field);

  if (type === 'INTEGER' || type === 'REAL' || type === 'NUMERIC') {
    if (/^(true|false)$/i.test(value)) return value.toLowerCase() === 'true' ? '1' : '0';

    if (
      !(type === 'INTEGER' ? /^[+-]?\d+$/ : /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i).test(
        value,
      )
    )
      throw new Error(`${field.name}: invalid numeric default.`);

    return value;
  }

  if (type === 'BLOB') throw new Error(`${field.name}: binary defaults require manual mapping.`);

  return `'${value.replaceAll("'", "''")}'`;
}

function validateTable(input: BuildDDLInput) {
  if (input.dbType !== 'sqlite') throw new Error('Select SQLite / D1 tables.');
  const parts = splitQualifiedName(input.tableName);
  const name = parts[0];

  if (parts.length !== 1 || !name?.trim() || name.includes('\0') || /^sqlite_/i.test(name))
    throw new Error('SQLite / D1 export requires an unqualified, non-reserved table name.');

  if (!input.fields.length) throw new Error(`${name}: add at least one field.`);

  if (
    input.tableMiscConfig?.enabled ||
    input.mysqlPartitionConfig?.enabled ||
    input.citusShardingConfig
  )
    throw new Error(`${name}: storage, partition and sharding options are not supported.`);
  const fields = new Map(input.fields.map((field) => [key(field.name), field]));

  if (
    fields.size !== input.fields.length ||
    input.fields.some((field) => !field.name.trim() || field.name.includes('\0'))
  )
    throw new Error(`${name}: invalid or duplicate fields.`);
  const primary = (input.indexes ?? []).filter((index) => index.kind === 'primary');

  if (primary.length > 1) throw new Error(`${name}: only one primary key is allowed.`);
  const primaryFields = primary[0]?.fields.map((field) => key(field.name)) ?? [];
  const auto = input.fields.filter((field) => field.defaultKind === 'auto_increment');

  if (
    auto.length > 1 ||
    auto.some(
      (field) =>
        sqliteType(field) !== 'INTEGER' ||
        primaryFields.length !== 1 ||
        primaryFields[0] !== key(field.name) ||
        primary[0]?.fields[0].direction !== 'ASC',
    )
  )
    throw new Error(`${name}: auto-increment requires one ascending INTEGER primary key.`);
  const names = new Set<string>();

  for (const index of input.indexes ?? []) {
    if (
      !index.name.trim() ||
      index.name.includes('\0') ||
      /^sqlite_/i.test(index.name) ||
      names.has(key(index.name)) ||
      !index.fields.length ||
      new Set(index.fields.map((field) => key(field.name))).size !== index.fields.length ||
      index.fields.some((field) => !fields.has(key(field.name)))
    )
      throw new Error(`${name}: invalid index ${index.name}.`);

    if (
      (index.kind === 'primary' || index.kind === 'unique_constraint') &&
      index.fields.some((field) => field.direction !== 'ASC')
    )
      throw new Error(
        `${name}: ordered primary and unique constraints require manual Drizzle mapping; use an ordered unique index instead.`,
      );
    names.add(key(index.name));
  }

  for (const fk of input.foreignKeys ?? []) {
    if (fk.logical) continue;
    const issue = getForeignKeyIssue(fk, 'sqlite');

    if (
      issue ||
      fk.refSchema ||
      !fk.name.trim() ||
      names.has(key(fk.name)) ||
      fk.fields.some((field) => !fields.has(key(field)))
    )
      throw new Error(`${name}: invalid foreign key ${fk.name}.`);
    names.add(key(fk.name));
  }

  for (const field of input.fields) {
    sqliteType(field);
    sqliteDefault(field);
  }

  return { name, fields, primaryFields, auto: auto[0] };
}

export function buildSqliteTable(input: BuildDDLInput): string {
  const { name, primaryFields, auto } = validateTable(input);

  const definitions = input.fields.map((field) => {
    const defaultValue = sqliteDefault(field);
    const identity = auto === field ? ' PRIMARY KEY AUTOINCREMENT' : '';
    const required = !field.nullable || primaryFields.includes(key(field.name));

    return `  ${quote(field.name)} ${sqliteType(field)}${identity}${required ? ' NOT NULL' : ''}${defaultValue ? ` DEFAULT ${defaultValue}` : ''}`;
  });
  const indexes: string[] = [];

  for (const index of input.indexes ?? []) {
    const columns = index.fields
      .map((field) => `${quote(field.name)} ${field.direction}`)
      .join(', ');

    if (index.kind === 'primary' && !auto)
      definitions.push(`  CONSTRAINT ${quote(index.name)} PRIMARY KEY (${columns})`);

    if (index.kind === 'unique_constraint')
      definitions.push(`  CONSTRAINT ${quote(index.name)} UNIQUE (${columns})`);

    if (index.kind === 'index' || index.kind === 'unique_index')
      indexes.push(
        `CREATE ${index.kind === 'unique_index' ? 'UNIQUE ' : ''}INDEX ${quote(index.name)} ON ${quote(name)} (${columns});`,
      );
  }

  for (const fk of input.foreignKeys ?? []) {
    if (fk.logical) continue;
    definitions.push(
      `  CONSTRAINT ${quote(fk.name)} FOREIGN KEY (${fk.fields.map(quote).join(', ')}) REFERENCES ${quote(fk.refTable)} (${fk.refFields.map(quote).join(', ')})${fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ''}${fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : ''}`,
    );
  }

  const comments = [
    input.tableComment,
    ...input.fields.flatMap((field) => {
      const value = resolveFieldComment(field);

      return value ? [`${field.name}: ${value}`] : [];
    }),
  ].flatMap((value) => (value ? [comment(value)] : []));

  return [
    ...comments,
    `CREATE TABLE ${quote(name)} (\n${definitions.join(',\n')}\n);`,
    ...indexes,
  ].join('\n');
}

function validateProject(inputs: BuildDDLInput[]) {
  if (!inputs.length) throw new Error('Select at least one SQLite table.');
  const tables = new Map<string, ReturnType<typeof validateTable>>();
  const tableInputs = new Map<string, BuildDDLInput>();
  const objectNames = new Set<string>();

  for (const input of inputs) {
    const table = validateTable(input);

    const names = [
      table.name,
      ...(input.indexes ?? []).flatMap((index) =>
        index.kind === 'index' || index.kind === 'unique_index' ? [index.name] : [],
      ),
    ];

    for (const name of names) {
      if (objectNames.has(key(name))) throw new Error(`Duplicate SQLite object: ${name}`);
      objectNames.add(key(name));
    }

    tables.set(key(table.name), table);
    tableInputs.set(key(table.name), input);
  }

  for (const input of inputs) {
    for (const fk of input.foreignKeys ?? []) {
      if (fk.logical) continue;
      const target = tables.get(key(fk.refTable));
      const targetInput = tableInputs.get(key(fk.refTable));

      const targetKey = targetInput?.indexes?.some(
        (index) =>
          index.kind !== 'index' &&
          index.fields.length === fk.refFields.length &&
          index.fields.every((field, i) => key(field.name) === key(fk.refFields[i])),
      );

      if (!target || !targetKey || fk.refFields.some((field) => !target.fields.has(key(field))))
        throw new Error(
          `${input.tableName}.${fk.name}: include the referenced table and its matching primary or unique key.`,
        );
    }
  }

  return tables;
}

export function buildSqliteDrizzle(inputs: BuildDDLInput[]): string {
  const tables = validateProject(inputs);
  const tableNames = new Map([...tables.keys()].map((name) => [name, codeName('table', name)]));

  const fieldsByTable = new Map(
    [...tables].map(([name, table]) => [
      name,
      new Map([...table.fields.keys()].map((field) => [field, codeName('column', field)])),
    ]),
  );
  const blocks = inputs.map((input) => {
    const { name, primaryFields, auto } = validateTable(input);
    const tableName = tableNames.get(key(name));
    const property = (field: string) => fieldsByTable.get(key(name))?.get(key(field));

    const columns = input.fields.map((field) => {
      const type = sqliteType(field).toLowerCase();
      const defaultValue = sqliteDefault(field);

      const builder =
        type === 'blob'
          ? `blob(${JSON.stringify(sqlName(field.name))}, { mode: 'buffer' })`
          : `${type}(${JSON.stringify(sqlName(field.name))})`;

      return `  ${property(field.name)}: ${builder}${auto === field ? '.primaryKey({ autoIncrement: true })' : ''}${!field.nullable || primaryFields.includes(key(field.name)) ? '.notNull()' : ''}${defaultValue ? `.default(sql.raw(${JSON.stringify(defaultValue)}))` : ''}`;
    });
    const constraints: string[] = [];

    for (const index of input.indexes ?? []) {
      const columns = index.fields.map((field) => `table.${property(field.name)}`);

      const ordered = index.fields.map(
        (field, i) => `${field.direction.toLowerCase()}(${columns[i]})`,
      );

      if (index.kind === 'primary' && !auto)
        constraints.push(
          `primaryKey({ name: ${JSON.stringify(sqlName(index.name))}, columns: [${columns.join(', ')}] })`,
        );

      if (index.kind === 'unique_constraint')
        constraints.push(
          `unique(${JSON.stringify(sqlName(index.name))}).on(${columns.join(', ')})`,
        );

      if (index.kind === 'unique_index' || index.kind === 'index')
        constraints.push(
          `${index.kind === 'unique_index' ? 'uniqueIndex' : 'index'}(${JSON.stringify(sqlName(index.name))}).on(${ordered.join(', ')})`,
        );
    }

    for (const fk of input.foreignKeys ?? []) {
      if (fk.logical) continue;
      const target = key(fk.refTable);
      const owner = target === key(name) ? 'table' : tableNames.get(target);

      const references = fk.refFields.map(
        (field) => `${owner}.${fieldsByTable.get(target)?.get(key(field))}`,
      );
      constraints.push(
        `foreignKey({ name: ${JSON.stringify(sqlName(fk.name))}, columns: [${fk.fields.map((field) => `table.${property(field)}`).join(', ')}], foreignColumns: [${references.join(', ')}] })${fk.onDelete ? `.onDelete(${JSON.stringify(fk.onDelete.toLowerCase())})` : ''}${fk.onUpdate ? `.onUpdate(${JSON.stringify(fk.onUpdate.toLowerCase())})` : ''}`,
      );
    }

    return `export const ${tableName} = sqliteTable(${JSON.stringify(name)}, {\n${columns.join(',\n')}\n}, (table): SQLiteTableExtraConfigValue[] => [${constraints.length ? `\n  ${constraints.join(',\n  ')}\n` : ''}]);`;
  });

  return `import { sql, asc, desc } from 'drizzle-orm';\nimport { sqliteTable, integer, text, real, blob, numeric, primaryKey, unique, index, uniqueIndex, foreignKey, type SQLiteTableExtraConfigValue } from 'drizzle-orm/sqlite-core';\n\n${blocks.join('\n\n')}\n`;
}

export function buildSqliteProject(tables: PersistedState[]) {
  const inputs = tables.map((table) => {
    if (table.schemaName || table.objectType === 'view')
      throw new Error(
        'Select unqualified SQLite tables; views and attached databases are not supported.',
      );

    return { ...table, fields: snapshotFields(table) };
  });
  validateProject(inputs);

  return { sql: inputs.map(buildSqliteTable).join('\n\n'), schema: buildSqliteDrizzle(inputs) };
}
