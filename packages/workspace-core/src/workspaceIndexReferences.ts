import {
  ensureFieldId,
  type FieldRow,
  type IndexDefinition,
  type IndexField,
} from '@ddlbuilder/shared-types';

type StoredIndexField = IndexField & { fieldId?: string };
export type StoredIndexDefinition = Omit<IndexDefinition, 'fields'> & {
  fields: StoredIndexField[];
};

const fieldIdsByName = (rows: FieldRow[]) => {
  const ids = new Map<string, string | null>();
  rows.forEach((row, index) => {
    const name = row.fieldName.trim();
    ids.set(name, ids.has(name) ? null : ensureFieldId(row, index));
  });
  return ids;
};

export const encodeIndexFieldReferences = (
  indexes: IndexDefinition[],
  rows: FieldRow[],
): StoredIndexDefinition[] => {
  const nextIds = fieldIdsByName(rows);
  return indexes.map((index) => ({
    ...index,
    fields: index.fields.map((field) => {
      const fieldId = nextIds.get(field.name.trim());
      return {
        name: field.name,
        direction: field.direction,
        ...(fieldId ? { fieldId } : {}),
      };
    }),
  }));
};

export const decodeIndexFieldReferences = (
  indexes: StoredIndexDefinition[],
  rows: FieldRow[],
): IndexDefinition[] => {
  const names = new Map(
    rows.map((row, index) => [ensureFieldId(row, index), row.fieldName.trim()]),
  );
  return indexes.map((index) => ({
    ...index,
    fields: index.fields.map((field) => ({
      name: field.fieldId ? (names.get(field.fieldId) ?? field.name) : field.name,
      direction: field.direction,
    })),
  }));
};
