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
import {
  RESERVED_KEYWORDS,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
  supportsUuidDefault,
} from '@ddlbuilder/ddl-core';

// oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof
export const toStringSafe = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  if (value == null) {
    return '';
  }

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

type NormalizedFieldCellValue = string | boolean;

// oxlint-disable-next-line anti-slop/no-unknown-parameters
const FIELD_CELL_NORMALIZERS = new Map<string, (value: unknown) => NormalizedFieldCellValue>([
  ['nullable', normalizeFieldNullable],
  ['defaultKind', normalizeFieldDefaultKind],
  ['onUpdate', normalizeFieldOnUpdate],
]);

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
