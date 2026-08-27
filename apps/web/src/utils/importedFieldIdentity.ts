import type { FieldRow, PersistedState } from '@ddlbuilder/shared-types';

const uniqueFieldsByName = (rows: FieldRow[]) => {
  const fields = new Map<string, FieldRow | null>();
  for (const row of rows) {
    const name = row.fieldName.trim();
    if (name) fields.set(name, fields.has(name) ? null : row);
  }
  return fields;
};

export function preserveImportedFieldIds(
  existing: PersistedState,
  imported: PersistedState,
): PersistedState {
  if (
    (existing.objectType ?? 'table') !== (imported.objectType ?? 'table') ||
    existing.dbType !== imported.dbType ||
    (existing.schemaName ?? '').trim() !== (imported.schemaName ?? '').trim() ||
    existing.tableName.trim() !== imported.tableName.trim()
  ) {
    return imported;
  }

  const existingFields = uniqueFieldsByName(existing.rows);
  const importedFields = uniqueFieldsByName(imported.rows);
  return {
    ...imported,
    rows: imported.rows.map((row) => {
      const name = row.fieldName.trim();
      const id = existingFields.get(name)?.id;
      return id && importedFields.get(name) ? { ...row, id } : row;
    }),
  };
}
