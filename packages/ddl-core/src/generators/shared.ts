import type { IndexDefinition } from '@ddlbuilder/shared-types';

export function getPrimaryKeyFieldNames(indexes: IndexDefinition[]): string[] {
  const primaryIndex = indexes.find((i) => i.isPrimary);
  return primaryIndex?.fields.map((f) => f.name) ?? [];
}

export function isPrimaryKeyField(fieldName: string, indexes: IndexDefinition[]): boolean {
  return getPrimaryKeyFieldNames(indexes).includes(fieldName);
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
  return `"${value.replace(/"/g, '\\"')}"`;
}

export function escapePythonString(value: string): string {
  return value.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

export function escapeJavaString(value: string): string {
  return value.replace(/"/g, '\\"');
}
