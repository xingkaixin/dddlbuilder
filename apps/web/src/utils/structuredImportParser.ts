import type { NormalizedField } from '@ddlbuilder/shared-types';
import type { ParsedResult } from '@ddlbuilder/ddl-core/parser';
import type { Range, WorkSheet } from 'xlsx';
import i18n from '@/i18n';
import { assertSafeExcelArchive } from '@/utils/excelArchiveGuard';
import {
  EXCEL_WORKBOOK_LIMITS,
  STRUCTURED_IMPORT_LIMITS,
  type ImportSourceType,
  getImportCharacterLimit,
  getImportFileByteLimit,
  toMebibytes,
} from '@/utils/importLimits';

export type StructuredImportSource = Exclude<ImportSourceType, 'sql'>;

const MAX_SCHEMA_RESOLUTION_STEPS = 32;

type JsonSchemaLike = {
  title?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  properties?: Record<string, JsonSchemaLike>;
  required?: string[];
  items?: JsonSchemaLike;
  enum?: unknown[];
  $ref?: string;
  allOf?: JsonSchemaLike[];
  anyOf?: JsonSchemaLike[];
  oneOf?: JsonSchemaLike[];
};

const EMPTY_TABLE: Omit<ParsedResult, 'tableName' | 'tableComment' | 'fields'> = {
  indexes: [],
  foreignKeys: [],
  authObjects: [],
};

export function parseStructuredImportText(
  source: Exclude<StructuredImportSource, 'excel'>,
  content: string,
  fallbackTableName: string,
): ParsedResult[] {
  const tables =
    source === 'json'
      ? parseJsonSchemaImport(content)
      : [parseDelimitedTable(content, fallbackTableName)];
  assertStructuredImportLimits(tables.map((table) => table.fields.length));
  return tables;
}

export async function parseExcelImport(file: File): Promise<ParsedResult[]> {
  const maxFileBytes = getImportFileByteLimit('excel');
  if (maxFileBytes !== null && file.size > maxFileBytes) {
    throw new Error(
      i18n.t('importSql.file.tooLarge', {
        max: toMebibytes(maxFileBytes).toLocaleString(),
      }),
    );
  }

  const workbook = await import('xlsx');
  const data = await file.arrayBuffer();
  assertSafeExcelArchive(data);
  const parsed = workbook.read(data, {
    type: 'array',
    sheets: Array.from({ length: EXCEL_WORKBOOK_LIMITS.maxSheets }, (_, index) => index),
    sheetRows: EXCEL_WORKBOOK_LIMITS.maxFieldsPerSheet + 2,
    dense: false,
    cellFormula: false,
    cellHTML: false,
  });
  if (parsed.SheetNames.length > EXCEL_WORKBOOK_LIMITS.maxSheets) {
    throwExcelWorkbookLimitError();
  }

  const sheets = parsed.SheetNames.flatMap((sheetName) => {
    const sheet = parsed.Sheets[sheetName];
    if (!sheet) return [];
    const range = readExcelSheetRange((reference) => workbook.utils.decode_range(reference), sheet);
    return range ? [{ sheetName, sheet, range }] : [];
  });

  const totalFields = sheets.reduce((total, { range }) => total + range.e.r, 0);
  if (totalFields > EXCEL_WORKBOOK_LIMITS.maxTotalFields) {
    throwExcelWorkbookLimitError();
  }

  const maxCharacters = getImportCharacterLimit('excel');
  let totalCharacters = 0;
  const tables: ParsedResult[] = [];
  for (const { sheetName, sheet, range } of sheets) {
    const rows = workbook.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
      range,
    });
    totalCharacters += rows.reduce(
      (rowTotal, row) =>
        rowTotal + row.reduce((cellTotal, cell) => cellTotal + String(cell ?? '').length, 0),
      0,
    );
    if (maxCharacters !== null && totalCharacters > maxCharacters) {
      throw new Error(i18n.t('importSql.contentTooLong', { max: maxCharacters.toLocaleString() }));
    }

    const table = tableFromRows(rows, sheetName);
    if (table.fields.length > 0) tables.push(table);
  }

  assertStructuredImportLimits(tables.map((table) => table.fields.length));
  return tables;
}

function readExcelSheetRange(
  decodeRange: (reference: string) => Range,
  sheet: WorkSheet,
): Range | null {
  const reference = sheet['!fullref'] ?? sheet['!ref'];
  if (typeof reference !== 'string') return null;

  let range: Range;
  try {
    range = decodeRange(reference);
  } catch {
    return throwExcelWorkbookLimitError();
  }

  if (
    range.s.r !== 0 ||
    range.s.c < 0 ||
    range.e.r < range.s.r ||
    range.e.c < range.s.c ||
    range.e.r > EXCEL_WORKBOOK_LIMITS.maxFieldsPerSheet ||
    range.e.c >= EXCEL_WORKBOOK_LIMITS.maxColumnsPerSheet
  ) {
    return throwExcelWorkbookLimitError();
  }

  return range;
}

function throwExcelWorkbookLimitError(): never {
  throw new Error(
    i18n.t('importSql.excelLimitsExceeded', {
      sheets: EXCEL_WORKBOOK_LIMITS.maxSheets.toLocaleString(),
      fields: EXCEL_WORKBOOK_LIMITS.maxFieldsPerSheet.toLocaleString(),
      columns: EXCEL_WORKBOOK_LIMITS.maxColumnsPerSheet.toLocaleString(),
      total: EXCEL_WORKBOOK_LIMITS.maxTotalFields.toLocaleString(),
    }),
  );
}

function parseDelimitedTable(content: string, fallbackTableName: string): ParsedResult {
  const delimiter = detectDelimiter(content);
  const rows = content
    .split(/\r?\n/)
    .map((line) => parseDelimitedLine(line, delimiter))
    .filter((row) => row.some((cell) => cell.trim()));
  assertStructuredImportLimits([Math.max(0, rows.length - 1)]);

  return tableFromRows(rows, fallbackTableName);
}

function tableFromRows(rows: string[][], fallbackTableName: string): ParsedResult {
  const headers = (rows[0] ?? []).map((cell) => normalizeHeader(cell));
  const nameIndex = findHeaderIndex(headers, ['字段名', 'fieldname', 'name'], 0);
  const typeIndex = findHeaderIndex(headers, ['字段类型', 'fieldtype', 'type'], 1);
  const commentIndex = findHeaderIndex(headers, ['字段注释', 'fieldcomment', 'comment'], 2);

  const fields = rows
    .slice(1)
    .map((row, index) => ({
      name: sanitizeIdentifier(row[nameIndex], `field_${index + 1}`),
      type: normalizeType(row[typeIndex]),
      comment: row[commentIndex]?.trim() ?? '',
      nullable: true,
      defaultKind: 'none' as const,
      defaultValue: '',
      onUpdate: 'none' as const,
    }))
    .filter((field) => field.name);

  return {
    ...EMPTY_TABLE,
    tableName: sanitizeIdentifier(fallbackTableName, 'imported_table'),
    tableComment: '',
    fields,
  };
}

function findHeaderIndex(headers: string[], names: string[], fallback: number): number {
  const index = headers.findIndex((header) => names.includes(header));
  return index >= 0 ? index : fallback;
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/[\s_-]/g, '')
    .toLowerCase();
}

function parseJsonSchemaImport(content: string): ParsedResult[] {
  const root = JSON.parse(content) as Record<string, unknown>;
  const schemas = collectSchemas(root);
  const entries = Object.entries(schemas);
  const tableSchemas: Array<[string, JsonSchemaLike]> =
    entries.length > 0
      ? entries
      : [[typeof root.title === 'string' ? root.title : 'imported_table', root as JsonSchemaLike]];
  if (tableSchemas.length > STRUCTURED_IMPORT_LIMITS.maxTables) {
    throwStructuredImportLimitError();
  }
  const resolvedSchemas = tableSchemas.map(([name, schema]) => ({
    name,
    schema: resolveSchema(schema, root),
  }));
  assertStructuredImportLimits(
    resolvedSchemas.map(({ schema }) => Object.keys(schema.properties ?? {}).length),
  );

  return resolvedSchemas.map(({ name, schema }) => schemaToTable(name, schema, root));
}

function collectSchemas(root: Record<string, unknown>): Record<string, JsonSchemaLike> {
  const components = root.components as { schemas?: Record<string, JsonSchemaLike> } | undefined;
  const swaggerDefinitions = root.definitions as Record<string, JsonSchemaLike> | undefined;
  const schemaDefinitions = (root.$defs ?? root.definitions) as
    | Record<string, JsonSchemaLike>
    | undefined;

  return components?.schemas ?? swaggerDefinitions ?? schemaDefinitions ?? {};
}

function schemaToTable(
  name: string,
  schema: JsonSchemaLike,
  root: Record<string, unknown>,
): ParsedResult {
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};
  const fields = Object.entries(properties).map(([fieldName, fieldSchema]) =>
    schemaPropertyToField(fieldName, resolveSchema(fieldSchema, root), required.has(fieldName)),
  );

  return {
    ...EMPTY_TABLE,
    tableName: sanitizeIdentifier(name, 'imported_table'),
    tableComment: schema.description ?? '',
    fields,
  };
}

function schemaPropertyToField(
  name: string,
  schema: JsonSchemaLike,
  required: boolean,
): NormalizedField {
  return {
    name: sanitizeIdentifier(name, 'field'),
    type: jsonSchemaTypeToSqlType(schema),
    comment: schema.description ?? '',
    nullable: !required,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  };
}

function resolveSchema(schema: JsonSchemaLike, root: Record<string, unknown>): JsonSchemaLike {
  let current = schema;
  let steps = 0;
  const visited = new Set<JsonSchemaLike>();

  while (true) {
    if (visited.has(current)) return throwJsonSchemaResolutionError();
    visited.add(current);

    let next: JsonSchemaLike | undefined;
    if (current.$ref) {
      const target = resolveRef(current.$ref, root);
      if (!target) return current;
      next = target;
    } else {
      const composed = current.allOf ?? current.oneOf ?? current.anyOf;
      if (!composed?.length) return current;
      next = composed[0];
    }

    steps += 1;
    if (steps > MAX_SCHEMA_RESOLUTION_STEPS) return throwJsonSchemaResolutionError();
    current = next;
  }
}

function resolveRef(ref: string, root: Record<string, unknown>): JsonSchemaLike | null {
  if (!ref.startsWith('#/')) return null;

  let current: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    if (!current || typeof current !== 'object') return null;
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!Object.prototype.hasOwnProperty.call(current, key)) return null;
    current = (current as Record<string, unknown>)[key];
  }

  return current && typeof current === 'object' ? (current as JsonSchemaLike) : null;
}

function assertStructuredImportLimits(fieldCounts: readonly number[]): void {
  if (fieldCounts.length > STRUCTURED_IMPORT_LIMITS.maxTables) {
    throwStructuredImportLimitError();
  }

  let totalFields = 0;
  for (const fieldCount of fieldCounts) {
    if (
      fieldCount > STRUCTURED_IMPORT_LIMITS.maxFieldsPerTable ||
      fieldCount > STRUCTURED_IMPORT_LIMITS.maxTotalFields - totalFields
    ) {
      throwStructuredImportLimitError();
    }
    totalFields += fieldCount;
  }
}

function throwStructuredImportLimitError(): never {
  throw new Error(
    i18n.t('importSql.structuredLimitsExceeded', {
      tables: STRUCTURED_IMPORT_LIMITS.maxTables.toLocaleString(),
      fields: STRUCTURED_IMPORT_LIMITS.maxFieldsPerTable.toLocaleString(),
      total: STRUCTURED_IMPORT_LIMITS.maxTotalFields.toLocaleString(),
    }),
  );
}

function throwJsonSchemaResolutionError(): never {
  throw new Error(i18n.t('importSql.jsonSchemaResolutionFailed'));
}

function jsonSchemaTypeToSqlType(schema: JsonSchemaLike): string {
  if (schema.enum) return 'varchar(255)';
  if (schema.format === 'date-time') return 'datetime';
  if (schema.format === 'date') return 'date';
  if (schema.format === 'uuid') return 'char(36)';
  if (schema.format === 'int64') return 'bigint';

  const type = Array.isArray(schema.type)
    ? schema.type.find((item) => item !== 'null') || schema.type[0]
    : schema.type;

  switch (type) {
    case 'integer':
      return schema.format === 'int32' ? 'int' : 'bigint';
    case 'number':
      return 'decimal(18,2)';
    case 'boolean':
      return 'boolean';
    case 'array':
    case 'object':
      return 'json';
    default:
      return 'varchar(255)';
  }
}

function normalizeType(value: string | undefined): string {
  const type = value?.trim();
  return type || 'varchar(255)';
}

function detectDelimiter(content: string): ',' | '\t' | ';' {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const candidates: Array<',' | '\t' | ';'> = [',', '\t', ';'];
  return candidates.reduce((best, candidate) =>
    firstLine.split(candidate).length > firstLine.split(best).length ? candidate : best,
  );
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function sanitizeIdentifier(value: string | undefined, fallback: string): string {
  const normalized = (value ?? '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || fallback;
}
