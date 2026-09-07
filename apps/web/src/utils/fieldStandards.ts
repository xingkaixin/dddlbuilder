import {
  createEntityId,
  FIELD_DEFAULT_KINDS,
  FIELD_ON_UPDATES,
  type FieldRow,
} from '@ddlbuilder/shared-types';
import { stableStringify } from '@ddlbuilder/workspace-core';
import { FIELD_STANDARD_STORE_NAME, openDb } from './workspaceDb';
import { runIndexedDbRequest, runIndexedDbTransaction } from './indexedDbTransaction';

export type StandardField = Omit<FieldRow, 'id' | 'standardId'>;
export type FieldStandard = {
  id: string;
  name: string;
  description: string;
  unit: string;
  field: StandardField;
};

export function standardField(row: FieldRow): StandardField {
  const { id: _id, standardId: _standardId, ...field } = row;
  return structuredClone(field);
}

export function applyFieldStandard(row: FieldRow, standard: FieldStandard): FieldRow {
  return { ...structuredClone(standard.field), id: row.id, standardId: standard.id };
}

export function fieldStandardDifferences(
  row: FieldRow,
  standard: FieldStandard,
): (keyof StandardField)[] {
  const actual = {
    ...standardField(row),
    defaultKind: row.defaultKind ?? 'none',
    defaultValue: row.defaultValue ?? '',
    onUpdate: row.onUpdate ?? 'none',
    enumMeta: row.enumMeta ?? [],
  };
  const expected = {
    ...standard.field,
    defaultKind: standard.field.defaultKind ?? 'none',
    defaultValue: standard.field.defaultValue ?? '',
    onUpdate: standard.field.onUpdate ?? 'none',
    enumMeta: standard.field.enumMeta ?? [],
  };
  return (Object.keys(expected) as (keyof StandardField)[]).filter((key) => {
    if (key === 'fieldType' && !/["']/.test(actual.fieldType + expected.fieldType))
      return (
        actual.fieldType.trim().toLowerCase().replaceAll(/\s+/g, '') !==
        expected.fieldType.trim().toLowerCase().replaceAll(/\s+/g, '')
      );
    return stableStringify(actual[key]) !== stableStringify(expected[key]);
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function decodeFieldStandards(value: unknown): FieldStandard[] {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.standards) ||
    value.standards.length > 1000
  )
    throw new Error('Invalid field standards file');
  const ids = new Set<string>();
  return value.standards.map((item: unknown) => {
    if (!isRecord(item) || !isRecord(item.field)) throw new Error('Invalid field standard');
    const { field } = item;
    for (const key of ['id', 'name', 'description', 'unit'] as const) {
      if (typeof item[key] !== 'string' || item[key].length > 10000)
        throw new Error('Invalid standard metadata');
    }
    if (!(item.id as string).trim() || !(item.name as string).trim() || ids.has(item.id as string))
      throw new Error('Invalid standard identity');
    ids.add(item.id as string);
    for (const key of ['fieldName', 'fieldType', 'fieldComment'] as const) {
      if (typeof field[key] !== 'string' || field[key].length > 10000)
        throw new Error('Invalid standard field');
    }
    if (
      !(field.fieldName as string).trim() ||
      !(field.fieldType as string).trim() ||
      typeof field.nullable !== 'boolean'
    )
      throw new Error('Incomplete standard field');
    if (
      field.defaultKind !== undefined &&
      !FIELD_DEFAULT_KINDS.some((kind) => kind === field.defaultKind)
    )
      throw new Error('Invalid default kind');
    if (field.onUpdate !== undefined && !FIELD_ON_UPDATES.some((kind) => kind === field.onUpdate))
      throw new Error('Invalid update kind');
    if (field.defaultValue !== undefined && typeof field.defaultValue !== 'string')
      throw new Error('Invalid default value');
    if (
      field.enumMeta !== undefined &&
      (!Array.isArray(field.enumMeta) ||
        !field.enumMeta.every(
          (entry: unknown) =>
            isRecord(entry) &&
            typeof entry.value === 'string' &&
            (entry.color === undefined || typeof entry.color === 'string') &&
            (entry.i18n === undefined ||
              (isRecord(entry.i18n) &&
                Object.values(entry.i18n).every((label) => typeof label === 'string'))),
        ))
    )
      throw new Error('Invalid enumeration');
    return {
      id: item.id as string,
      name: (item.name as string).trim(),
      description: item.description as string,
      unit: item.unit as string,
      field: {
        fieldName: (field.fieldName as string).trim(),
        fieldType: (field.fieldType as string).trim(),
        fieldComment: field.fieldComment as string,
        nullable: field.nullable,
        defaultKind: (field.defaultKind ?? 'none') as FieldRow['defaultKind'],
        defaultValue: (field.defaultValue ?? '') as string,
        onUpdate: (field.onUpdate ?? 'none') as FieldRow['onUpdate'],
        ...(field.enumMeta
          ? { enumMeta: structuredClone(field.enumMeta) as FieldRow['enumMeta'] }
          : {}),
      },
    };
  });
}

export async function listFieldStandards(): Promise<FieldStandard[]> {
  return runIndexedDbRequest(await openDb(), FIELD_STANDARD_STORE_NAME, 'readonly', (store) =>
    store.getAll(),
  );
}

export async function saveFieldStandards(standards: FieldStandard[]): Promise<void> {
  const validated = decodeFieldStandards({ version: 1, standards });
  await runIndexedDbTransaction(await openDb(), FIELD_STANDARD_STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(FIELD_STANDARD_STORE_NAME);
    for (const standard of validated) store.put(standard);
    return () => undefined;
  });
}

export async function deleteFieldStandard(id: string): Promise<void> {
  await runIndexedDbRequest(await openDb(), FIELD_STANDARD_STORE_NAME, 'readwrite', (store) =>
    store.delete(id),
  );
}

export function createFieldStandard(row: FieldRow): FieldStandard {
  return {
    id: createEntityId(),
    name: row.fieldComment || row.fieldName,
    description: '',
    unit: '',
    field: standardField(row),
  };
}
