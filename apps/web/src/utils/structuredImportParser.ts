import type { NormalizedField } from '@ddlbuilder/shared-types';
import type { ParsedResult } from './SqlParser';

export type StructuredImportSource = 'csv' | 'excel' | 'json';

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
  if (source === 'json') {
    return parseJsonSchemaImport(content);
  }
  return [parseDelimitedTable(content, fallbackTableName)];
}

export async function parseExcelImport(file: File): Promise<ParsedResult[]> {
  const workbook = await import('xlsx');
  const data = await file.arrayBuffer();
  const parsed = workbook.read(data, { type: 'array' });

  return parsed.SheetNames.map((sheetName) => {
    const sheet = parsed.Sheets[sheetName];
    const rows = workbook.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      blankrows: false,
      raw: false,
    });
    return tableFromRows(rows, sheetName);
  }).filter((table) => table.fields.length > 0);
}

function parseDelimitedTable(content: string, fallbackTableName: string): ParsedResult {
  const delimiter = detectDelimiter(content);
  const rows = content
    .split(/\r?\n/)
    .map((line) => parseDelimitedLine(line, delimiter))
    .filter((row) => row.some((cell) => cell.trim()));

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

  if (entries.length > 0) {
    return entries.map(([name, schema]) => schemaToTable(name, schema, root));
  }

  const title = typeof root.title === 'string' ? root.title : 'imported_table';
  return [schemaToTable(title, root as JsonSchemaLike, root)];
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
  const resolved = resolveSchema(schema, root);
  const required = new Set(resolved.required ?? []);
  const properties = resolved.properties ?? {};
  const fields = Object.entries(properties).map(([fieldName, fieldSchema]) =>
    schemaPropertyToField(fieldName, resolveSchema(fieldSchema, root), required.has(fieldName)),
  );

  return {
    ...EMPTY_TABLE,
    tableName: sanitizeIdentifier(name, 'imported_table'),
    tableComment: resolved.description ?? '',
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
  if (schema.$ref) {
    const target = resolveRef(schema.$ref, root);
    return target ? resolveSchema(target, root) : schema;
  }

  const composed = schema.allOf ?? schema.oneOf ?? schema.anyOf;
  if (composed?.length) {
    return resolveSchema(composed[0], root);
  }

  return schema;
}

function resolveRef(ref: string, root: Record<string, unknown>): JsonSchemaLike | null {
  if (!ref.startsWith('#/')) return null;

  let current: unknown = root;
  for (const part of ref.slice(2).split('/')) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }

  return current && typeof current === 'object' ? (current as JsonSchemaLike) : null;
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
