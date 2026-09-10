import {
  createEntityId,
  type DatabaseType,
  type FieldDefaultKind,
  type FieldOnUpdate,
  type FieldRow,
  type NormalizedField,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';
import { RESERVED_KEYWORDS } from './constants/reservedKeywords';
import {
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  supportsUuidDefault,
} from '@ddlbuilder/ddl-core';

// This conversion is the shared boundary for pasted and persisted cell values; callers explicitly
// need JavaScript's string fallback for values that are not already strings.
// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof
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
// oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof

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

// Cell editors provide a deliberately open value union keyed by the selected column.
type NormalizedFieldCellValue = string | boolean;

// The map receives raw editor cell values before the selected normalizer validates them.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
const FIELD_CELL_NORMALIZERS = new Map<string, (value: unknown) => NormalizedFieldCellValue>([
  ['nullable', normalizeFieldNullable],
  ['defaultKind', normalizeFieldDefaultKind],
  ['onUpdate', normalizeFieldOnUpdate],
]);

/** 表格单元格的输入可能来自勾选框、下拉框或粘贴的文本，按列收敛成该列的存储类型。 */
// oxlint-disable anti-slop/no-unknown-parameters
export const normalizeFieldCellValue = (prop: string, value: unknown): NormalizedFieldCellValue =>
  (FIELD_CELL_NORMALIZERS.get(prop) ?? toStringSafe)(value);
// oxlint-enable anti-slop/no-unknown-parameters

export const normalizeFields = (rows: FieldRow[]): NormalizedField[] => {
  return rows.flatMap((row) => {
    const field = {
      name: toStringSafe(row.fieldName).trim(),
      type: toStringSafe(row.fieldType).trim(),
      comment: toStringSafe(row.fieldComment).trim(),
      nullable: row.nullable,
      defaultKind: row.defaultKind ?? 'none',
      defaultValue: toStringSafe(row.defaultValue),
      onUpdate: row.onUpdate ?? 'none',
      enumMeta: row.enumMeta,
    };

    return field.name && field.type ? [field] : [];
  });
};

export const getUiDefaultKindOptions = (
  db: DatabaseType,
  canonical: string,
): FieldDefaultKind[] => {
  const opts: FieldDefaultKind[] = ['none', 'constant', 'expression'];

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
