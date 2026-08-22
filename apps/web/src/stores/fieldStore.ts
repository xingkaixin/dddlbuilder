import { ensureFieldId, type FieldRow } from '@ddlbuilder/shared-types';
import {
  createEmptyRow,
  normalizeFieldCellValue,
  normalizeFieldEnums,
  normalizeFields,
  toStringSafe,
} from '@/utils/helpers';
import type { TableCellChange } from '@/types/tableChanges';
import type { EditorSetState, FieldSlice } from './editorStoreTypes';

function createInitialRows(count: number): FieldRow[] {
  return Array.from({ length: count }, () => createEmptyRow());
}

function normalizePersistedRows(rows: FieldRow[]): FieldRow[] {
  return rows.map((row, index) => ({
    ...normalizeFieldEnums({
      nullable: row.nullable,
      defaultKind: row.defaultKind,
      onUpdate: row.onUpdate,
    }),
    id: ensureFieldId(row, index),
    fieldName: toStringSafe(row.fieldName),
    fieldType: toStringSafe(row.fieldType),
    fieldComment: toStringSafe(row.fieldComment),
    defaultValue: toStringSafe(row.defaultValue),
    ...(row.enumMeta === undefined ? {} : { enumMeta: row.enumMeta }),
  }));
}

export const createFieldSlice = (set: EditorSetState): FieldSlice => ({
  rows: createInitialRows(12),
  setRows: (next) =>
    set((state) => ({
      rows: typeof next === 'function' ? next(state.rows) : next,
    })),
  initializeRows: (persistedRows) => {
    if (!persistedRows || persistedRows.length === 0) return;
    set({ rows: normalizePersistedRows(persistedRows) });
  },
  resetRows: (count = 12) => {
    set({ rows: createInitialRows(Math.max(1, Math.floor(count))) });
  },
  handleRowsChange: (changes, source) => {
    if (!changes || source === 'loadData') {
      return;
    }

    const validChanges = changes.filter((change): change is TableCellChange =>
      Array.isArray(change),
    );

    if (validChanges.length === 0) {
      return;
    }

    set((state) => {
      const nextRows = state.rows.map((row) => ({ ...row }));

      validChanges.forEach(([rowIndex]) => {
        while (nextRows.length <= rowIndex) {
          nextRows.push(createEmptyRow());
        }
      });

      validChanges.forEach(([rowIndex, prop, , value]) => {
        if (typeof prop !== 'string' || prop === 'order') {
          return;
        }

        nextRows[rowIndex] = {
          ...nextRows[rowIndex],
          [prop]: normalizeFieldCellValue(prop, value),
        };
      });

      validChanges.forEach(([rowIndex, prop, , value]) => {
        if (prop !== 'defaultKind') {
          return;
        }

        if (value !== 'constant') {
          nextRows[rowIndex].defaultValue = '';
        }
        if (value === 'auto_increment') {
          nextRows[rowIndex].nullable = false;
        }
      });

      return {
        rows: nextRows,
      };
    });
  },
  handleCreateRow: (index, amount) => {
    set((state) => {
      const nextRows = state.rows.slice();
      for (let i = 0; i < amount; i += 1) {
        nextRows.splice(index + i, 0, createEmptyRow());
      }
      return { rows: nextRows };
    });
  },
  handleRemoveRow: (index, amount) => {
    set((state) => {
      const nextRows = state.rows.slice();
      nextRows.splice(index, amount);
      if (nextRows.length === 0) {
        nextRows.push(createEmptyRow());
      }
      return { rows: nextRows };
    });
  },
  handleAddRows: (count) => {
    const n = Math.floor(Number(count));
    const amount = Number.isFinite(n) && n > 0 ? n : 1;

    set((state) => {
      const index = state.rows.length;
      const nextRows = state.rows.slice();
      for (let i = 0; i < amount; i += 1) {
        nextRows.splice(index + i, 0, createEmptyRow());
      }
      return { rows: nextRows };
    });
  },
});

export function buildDuplicateNameSet(rows: FieldRow[]): Set<string> {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const name = toStringSafe(row.fieldName).trim();
    if (!name) return;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  const duplicates = new Set<string>();
  counts.forEach((count, name) => {
    if (count > 1) duplicates.add(name);
  });
  return duplicates;
}

export function buildNormalizedFields(rows: FieldRow[]) {
  return normalizeFields(rows);
}
