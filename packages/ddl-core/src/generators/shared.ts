import type { IndexDefinition } from '@ddlbuilder/shared-types';

export function getPrimaryKeyFieldNames(indexes: IndexDefinition[]): string[] {
  const primaryIndex = indexes.find((i) => i.isPrimary);
  return primaryIndex?.fields.map((f) => f.name) ?? [];
}

export function isPrimaryKeyField(fieldName: string, indexes: IndexDefinition[]): boolean {
  return getPrimaryKeyFieldNames(indexes).includes(fieldName);
}

export function buildIndexFieldLookup(indexes: IndexDefinition[]) {
  const primaryFields = new Set(getPrimaryKeyFieldNames(indexes));
  const singleUniqueFields = new Set<string>();

  for (const index of indexes) {
    if (index.unique && !index.isPrimary && index.fields.length === 1) {
      singleUniqueFields.add(index.fields[0].name);
    }
  }

  return { primaryFields, singleUniqueFields };
}

export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

export function escapePrismaDefault(value: string): string {
  if (value.toLowerCase() === 'current_timestamp' || value.toLowerCase() === 'now()') {
    return 'now()';
  }
  // For numeric/boolean values, return as-is; for strings, quote them
  if (/^-?\d+(\.\d+)?$/.test(value) || value === 'true' || value === 'false') {
    return value;
  }
  return JSON.stringify(value);
}

export function escapePythonString(value: string): string {
  return JSON.stringify(value).slice(1, -1).replaceAll("'", "\\'");
}

export function escapeJavaString(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

export const tsStringLiteral = (value: string) => `'${escapePythonString(value)}'`;

export const formatLineComment = (value: string, prefix: string) =>
  value
    .trim()
    .split(/\r?\n/)
    .map((line) => `${prefix}${line}`)
    .join('\n');
