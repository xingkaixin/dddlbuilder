import type { IndexField } from '@ddlbuilder/shared-types';
import {
  readField,
  stringifyAstValue,
  type ColumnListNode,
  type ColumnTypeNode,
} from './astTypes.js';

export function normalizeColumnName(column: unknown): string {
  if (column === undefined || column === null) return '';
  if (typeof column === 'string') return column;
  if (typeof column === 'object') {
    const nested = readField(column, 'column');
    if (nested !== undefined) {
      return normalizeColumnName(nested);
    }
    const exprValue = readField(readField(column, 'expr'), 'value');
    if (exprValue !== undefined) {
      return normalizeColumnName(exprValue);
    }
    const value = readField(column, 'value');
    if (value !== undefined) {
      return normalizeColumnName(value);
    }
  }
  return stringifyAstValue(column);
}

export function buildTypeString(definition: ColumnTypeNode | undefined): string {
  const baseType = definition?.dataType || '';
  const length = definition?.length;
  const scale = definition?.scale;
  const suffix = definition?.suffix;
  const normalizedScale =
    scale === null || scale === undefined || scale === 'null' ? undefined : scale;

  if (length && normalizedScale !== undefined) {
    return `${baseType}(${length},${normalizedScale})`;
  }
  if (length) {
    return `${baseType}(${length})`;
  }
  if (Array.isArray(suffix) && suffix.length > 0) {
    const suffixValues = suffix.filter(
      (v) => v !== null && v !== undefined && stringifyAstValue(v).toLowerCase() !== 'null',
    );
    if (suffixValues.length > 0) {
      return `${baseType}(${suffixValues.join(',')})`;
    }
    return baseType;
  }
  return baseType;
}

export function extractFunctionName(val: unknown): string | null {
  if (!val) return null;
  const keyword = readField(val, 'keyword');
  if (keyword) {
    return stringifyAstValue(keyword).toLowerCase();
  }
  const name = readField(val, 'name');
  if (readField(val, 'type') === 'function' && name) {
    const nameParts = readField(name, 'name');
    if (Array.isArray(nameParts) && nameParts[0]) {
      const nameNode: unknown = nameParts[0];
      const rawName =
        readField(nameNode, 'value') ?? readField(readField(nameNode, 'expr'), 'value') ?? nameNode;
      return rawName ? stringifyAstValue(rawName).toLowerCase() : null;
    }
    if (typeof name === 'string') {
      return name.toLowerCase();
    }
  }
  if (typeof val === 'string') {
    return val.toLowerCase();
  }
  return null;
}

export function normalizeLiteral(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') {
    const value = readField(val, 'value');
    if (value !== undefined) {
      return normalizeLiteral(value);
    }
    const expr = readField(val, 'expr');
    if (expr !== undefined) {
      return normalizeLiteral(expr);
    }
  }
  return stringifyAstValue(val).replace(/^'|'$/g, '');
}

export function buildIndexFields(columns: ColumnListNode[] | undefined): IndexField[] {
  if (!Array.isArray(columns)) return [];

  return columns
    .map((col) => {
      const name = normalizeColumnName(col?.column ?? col);
      if (!name) return null;
      const order = col?.order_by || col?.order_by_expr || col?.order;
      const direction = order && String(order).toUpperCase().includes('DESC') ? 'DESC' : 'ASC';
      return { name, direction };
    })
    .filter((field): field is IndexField => field !== null);
}
