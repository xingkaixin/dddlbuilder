import type { PersistedState } from '@ddlbuilder/shared-types';

export const validateIndexFields = (state: PersistedState) => {
  const names = new Set(
    state.rows.map((row) => row.fieldName.trim().toLowerCase()).filter((name) => name.length > 0),
  );
  for (const index of state.indexes) {
    for (const field of index.fields) {
      if (!names.has(field.name.trim().toLowerCase())) {
        throw new Error(`Unknown index field: ${field.name}`);
      }
    }
  }
};
