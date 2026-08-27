import type { PersistedState } from '@ddlbuilder/shared-types';
import { getSqlIdentifierKey } from '@ddlbuilder/ddl-core';

export const validateUniqueFieldNames = (state: Pick<PersistedState, 'rows' | 'dbType'>) => {
  const names = new Set<string>();
  for (const row of state.rows) {
    const name = getSqlIdentifierKey(row.fieldName, state.dbType);
    if (!name) continue;
    if (names.has(name)) throw new Error(`Duplicate field name: ${row.fieldName}`);
    names.add(name);
  }
  return names;
};

export const validateDocumentFields = (state: PersistedState) => {
  const names = validateUniqueFieldNames(state);
  for (const index of state.indexes) {
    for (const field of index.fields) {
      if (!names.has(getSqlIdentifierKey(field.name, state.dbType))) {
        throw new Error(`Unknown index field: ${field.name}`);
      }
    }
  }
};
