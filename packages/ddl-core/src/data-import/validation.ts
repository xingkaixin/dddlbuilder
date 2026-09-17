import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildDDL } from '../utils/ddlGenerators.js';
import { quoteIdentifier } from '../utils/databaseFamily.js';
import { snapshotFields } from '../utils/schemaSnapshot.js';
import { checkImportValue, importStringLiteral, parseImportType } from './values.js';
import {
  BUSINESS_DATA_LIMITS,
  dataImportValue,
  isDataImportName,
  type BusinessData,
  type DataImportColumn,
  type DataImportDialect,
  type DataImportOptions,
  type DataImportResult,
  type DataImportTarget,
} from './types.js';

export function existingDataImportTarget(table: PersistedState): DataImportTarget {
  if ((table.dbType !== 'mysql' && table.dbType !== 'postgresql') || table.objectType === 'view')
    throw new Error('dataImport.errors.target');

  return {
    dbType: table.dbType,
    tableName: table.tableName,
    schemaName: table.schemaName,
    fields: snapshotFields(table),
    indexes: table.indexes,
  };
}

export function newDataImportTarget(
  dbType: DataImportDialect,
  tableName: string,
  schemaName: string,
  columns: DataImportColumn[],
): DataImportTarget {
  return {
    dbType,
    tableName,
    schemaName,
    indexes: [],
    fields: columns.flatMap((column) =>
      column.source === null
        ? []
        : [
            {
              name: column.name,
              type: column.type,
              nullable: column.nullable,
              comment: '',
              defaultKind: 'none',
              defaultValue: '',
              onUpdate: 'none',
            },
          ],
    ),
  };
}

export function validateBusinessData(
  data: BusinessData,
  target: DataImportTarget,
  columns: DataImportColumn[],
  options: DataImportOptions,
  createTable: boolean,
): DataImportResult {
  const result: DataImportResult = {
    issues: [],
    sql: '',
    rowCount: data.rows.length,
    columns: [],
    preview: [],
  };
  const issue = (
    code: DataImportResult['issues'][number]['code'],
    field = '',
    detail = '',
    line = 0,
    value = '',
  ) => result.issues.push({ code, field, detail, line, value });
  const validName = (name: string) => isDataImportName(name, target.dbType);

  if (!validName(target.tableName) || (target.schemaName && !validName(target.schemaName)))
    issue('name', target.tableName);

  if (
    !data.rows.length ||
    data.rows.length > BUSINESS_DATA_LIMITS.rows ||
    !data.headers.length ||
    data.headers.length > BUSINESS_DATA_LIMITS.columns ||
    data.rows.length * data.headers.length > BUSINESS_DATA_LIMITS.cells ||
    data.rows.some((row) => row.values.length !== data.headers.length)
  )
    issue('source');

  if (new Set(data.headers).size !== data.headers.length) issue('source');

  if (!target.fields.length || target.fields.length > BUSINESS_DATA_LIMITS.columns) issue('target');

  const nameKey = (name: string) => (target.dbType === 'mysql' ? name.toLowerCase() : name);
  const names = new Set<string>();

  for (const field of target.fields) {
    if (!validName(field.name) || names.has(nameKey(field.name))) issue('name', field.name);
    names.add(nameKey(field.name));
  }

  const primary = new Set(
    target.indexes.flatMap((index) =>
      index.kind === 'primary' ? index.fields.map((field) => field.name) : [],
    ),
  );
  const mapped = target.fields.flatMap((field) => {
    const matches = columns.filter(
      (column) => column.name === field.name && column.source !== null,
    );

    if (matches.length > 1) issue('source', field.name);
    const column = matches[0];

    if (!column) {
      if (
        (!field.nullable || primary.has(field.name)) &&
        field.defaultKind === 'none' &&
        !/^(?:smallserial|serial|bigserial)$/i.test(field.type.trim())
      )
        issue('required', field.name);

      return [];
    }

    const source = data.headers.findIndex((header) => header === column.source);

    if (source < 0) issue('source', field.name, column.source ?? '');
    const type = parseImportType(field.type, target.dbType);

    if (!type) issue('type', field.name, field.type);

    return [{ field, source, type }];
  });

  for (const column of columns) {
    if (column.source !== null && !target.fields.some((field) => field.name === column.name))
      issue('source', column.name);
  }

  if (!mapped.length || new Set(mapped.map((column) => column.source)).size !== mapped.length)
    issue('source');
  result.columns = mapped.map((column) => column.field.name);

  const unique = target.indexes.flatMap((index) => {
    if (index.kind === 'index') return [];

    if (
      !index.fields.length ||
      index.fields.some(
        (field) => !target.fields.some((candidate) => candidate.name === field.name),
      )
    )
      issue('target', index.name);
    const positions = index.fields.map((field) => result.columns.indexOf(field.name));

    return positions.every((position) => position >= 0)
      ? [{ name: index.name, positions, seen: new Map<string, number>() }]
      : [];
  });

  if (result.issues.length) return result;
  const sqlRows: string[] = [];

  for (const row of data.rows) {
    const values: (string | null)[] = [];
    const literals: string[] = [];
    const before = result.issues.length;

    for (const { field, source, type } of mapped) {
      const raw = row.values[source];
      const value = dataImportValue(raw, options);

      if (value === null) {
        if (!field.nullable || primary.has(field.name))
          issue('required', field.name, '', row.line, raw);
        values.push(null);
        literals.push('NULL');
        continue;
      }

      if (!type) continue;
      const checked = checkImportValue(value, type, options.dateFormat);

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- a string denotes a value-validation issue, not a SQL value.
      if (typeof checked === 'string') {
        issue(checked, field.name, field.type, row.line, raw);
        continue;
      }

      if (field.enumMeta?.length && !field.enumMeta.some((entry) => entry.value === value))
        issue('enum', field.name, '', row.line, raw);
      values.push(checked.value);
      literals.push(
        checked.numeric ? checked.value : importStringLiteral(checked.value, target.dbType),
      );
    }

    if (before !== result.issues.length) continue;

    for (const key of unique) {
      const parts = key.positions.map((position) => values[position]);

      if (parts.includes(null)) continue;
      const signature = JSON.stringify(parts);
      const firstLine = key.seen.get(signature);

      if (firstLine !== undefined)
        issue('duplicate', key.name, String(firstLine), row.line, parts.join(' / '));
      else key.seen.set(signature, row.line);
    }

    sqlRows.push(`(${literals.join(', ')})`);

    if (result.preview.length < 5) result.preview.push(values);
  }

  if (result.issues.length) return result;

  const qualified = [target.schemaName, target.tableName]
    .flatMap((name) => (name ? [quoteIdentifier(name, target.dbType)] : []))
    .join('.');
  const statements: string[] = [];

  if (createTable)
    statements.push(
      buildDDL({
        dbType: target.dbType,
        tableName: qualified,
        tableComment: '',
        fields: target.fields,
        indexes: target.indexes,
      }),
    );
  const insert = `INSERT INTO ${qualified} (${result.columns.map((name) => quoteIdentifier(name, target.dbType)).join(', ')}) VALUES\n`;

  for (let offset = 0; offset < sqlRows.length; offset += 100)
    statements.push(`${insert}${sqlRows.slice(offset, offset + 100).join(',\n')};`);
  result.sql = `${statements.join('\n\n')}\n`;

  return result;
}
