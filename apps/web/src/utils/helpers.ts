import {
  createEntityId,
  type DatabaseType,
  type FieldDefaultKind,
  type FieldOnUpdate,
  type FieldRow,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';
import { RESERVED_KEYWORDS } from './constants';
import {
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  supportsUuidDefault,
} from '@ddlbuilder/ddl-core';

export const toStringSafe = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return '';
  }
  // This helper intentionally preserves JavaScript's default string coercion semantics.
  // oxlint-disable-next-line typescript/no-base-to-string
  return String(value);
};

export const isReservedKeyword = (db: DatabaseType, name: string) => {
  const lower = toStringSafe(name).trim().toLowerCase();
  if (!lower) return false;
  return RESERVED_KEYWORDS[db]?.has(lower) ?? false;
};

export const createEmptyRow = (): FieldRow => ({
  id: createEntityId(),
  fieldName: '',
  fieldType: '',
  fieldComment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
});

const FIELD_CELL_NORMALIZERS = new Map<string, (value: unknown) => unknown>([
  ['nullable', normalizeFieldNullable],
  ['defaultKind', normalizeFieldDefaultKind],
  ['onUpdate', normalizeFieldOnUpdate],
]);

/** 表格单元格的输入可能来自勾选框、下拉框或粘贴的文本，按列收敛成该列的存储类型。 */
export const normalizeFieldCellValue = (prop: string, value: unknown): unknown =>
  (FIELD_CELL_NORMALIZERS.get(prop) ?? toStringSafe)(value);

export const normalizeFields = (rows: FieldRow[]) =>
  rows
    .map((row) => ({
      name: toStringSafe(row.fieldName).trim(),
      type: toStringSafe(row.fieldType).trim(),
      comment: toStringSafe(row.fieldComment).trim(),
      nullable: row.nullable,
      defaultKind: row.defaultKind ?? 'none',
      defaultValue: toStringSafe(row.defaultValue).trim(),
      onUpdate: row.onUpdate ?? 'none',
      enumMeta: row.enumMeta,
    }))
    .filter((field) => field.name && field.type);

export const getUiDefaultKindOptions = (
  db: DatabaseType,
  canonical: string,
): FieldDefaultKind[] => {
  const opts: FieldDefaultKind[] = ['none', 'constant'];
  if (supportsAutoIncrement(db, canonical)) opts.splice(1, 0, 'auto_increment');
  if (supportsUuidDefault(canonical)) opts.push('uuid');
  if (supportsDefaultCurrentTimestamp(db, canonical)) opts.push('current_timestamp');
  return opts;
};

export const getUiOnUpdateOptions = (db: DatabaseType, canonical: string): FieldOnUpdate[] => {
  const opts: FieldOnUpdate[] = ['none'];
  if (supportsOnUpdateCurrentTimestamp(db, canonical)) opts.push('current_timestamp');
  return opts;
};
