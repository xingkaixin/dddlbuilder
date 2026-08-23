import type { FieldRow } from '@ddlbuilder/shared-types';
import { createEmptyRow, normalizeFields, toStringSafe } from '@/utils/helpers';
import type { EditorSetState, FieldSlice } from './editorStoreTypes';

function createInitialRows(count: number): FieldRow[] {
  return Array.from({ length: count }, () => createEmptyRow());
}

export const createFieldSlice = (set: EditorSetState): FieldSlice => ({
  rows: createInitialRows(12),
  setRows: (next) =>
    set((state) => ({
      rows: typeof next === 'function' ? next(state.rows) : next,
    })),
  resetRows: (count = 12) => {
    set({ rows: createInitialRows(Math.max(1, Math.floor(count))) });
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
