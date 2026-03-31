import type { IndexField } from '../../types/index.js';

export function normalizeColumnName(column: any): string {
  if (column === undefined || column === null) return '';
  if (typeof column === 'string') return column;
  if (typeof column === 'object') {
    if (column.column !== undefined) {
      return normalizeColumnName(column.column);
    }
    if (column.expr && column.expr.value !== undefined) {
      return normalizeColumnName(column.expr.value);
    }
    if (column.value !== undefined) {
      return normalizeColumnName(column.value);
    }
  }
  return String(column);
}

export function buildTypeString(definition: any): string {
  const baseType = definition?.dataType || '';
  const length = definition?.length;
  const scale = definition?.scale;
  const normalizedScale =
    scale === null || scale === undefined || scale === 'null' ? undefined : scale;

  if (length && normalizedScale !== undefined) {
    return `${baseType}(${length},${normalizedScale})`;
  }
  if (length) {
    return `${baseType}(${length})`;
  }
  if (Array.isArray(definition?.suffix) && definition.suffix.length > 0) {
    const suffixValues = definition.suffix.filter(
      (v: any) => v !== null && v !== undefined && String(v).toLowerCase() !== 'null',
    );
    if (suffixValues.length > 0) {
      return `${baseType}(${suffixValues.join(',')})`;
    }
    return baseType;
  }
  return baseType;
}

export function extractFunctionName(val: any): string | null {
  if (!val) return null;
  if (val.keyword) {
    return String(val.keyword).toLowerCase();
  }
  if (val.type === 'function' && val.name) {
    if (Array.isArray(val.name.name) && val.name.name[0]) {
      const nameNode = val.name.name[0];
      const rawName = nameNode?.value ?? nameNode?.expr?.value ?? val.name.name[0];
      return rawName ? String(rawName).toLowerCase() : null;
    }
    if (typeof val.name === 'string') {
      return val.name.toLowerCase();
    }
  }
  if (typeof val === 'string') {
    return val.toLowerCase();
  }
  return null;
}

export function normalizeLiteral(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'object') {
    if (val.value !== undefined) {
      return normalizeLiteral(val.value);
    }
    if (val.expr !== undefined) {
      return normalizeLiteral(val.expr);
    }
  }
  return String(val).replace(/^'|'$/g, '');
}

export function buildIndexFields(columns: any[]): IndexField[] {
  if (!Array.isArray(columns)) return [];

  return columns
    .map((col: any) => {
      const name = normalizeColumnName(col?.column ?? col);
      if (!name) return null;
      const direction =
        col?.order_by || col?.order_by_expr || col?.order
          ? String(col.order_by || col.order_by_expr || col.order)
              .toUpperCase()
              .includes('DESC')
            ? 'DESC'
            : 'ASC'
          : 'ASC';
      return { name, direction } as IndexField;
    })
    .filter(Boolean) as IndexField[];
}
