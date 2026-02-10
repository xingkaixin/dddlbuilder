import { create } from 'zustand';
import type Handsontable from 'handsontable';
import type { FieldRow } from '@/types';
import {
  createEmptyRow,
  ensureOrder,
  toStringSafe,
  normalizeFields,
} from '@/utils/helpers';

function createInitialRows(count: number): FieldRow[] {
  return Array.from({ length: count }, (_, index) => createEmptyRow(index));
}

function normalizeRowValue(value: unknown): string {
  return value == null ? '' : String(value);
}

function normalizeNullableValue(value: unknown): '是' | '否' {
  if (value === false) return '否';
  return String(value ?? '').trim() === '否' ? '否' : '是';
}

function normalizePersistedRows(rows: FieldRow[]): FieldRow[] {
  return rows.map((row, index) => ({
    ...createEmptyRow(index),
    ...row,
    order: index + 1,
    fieldName: normalizeRowValue(row.fieldName),
    fieldType: normalizeRowValue(row.fieldType),
    fieldComment: normalizeRowValue(row.fieldComment),
    nullable: normalizeNullableValue(row.nullable),
    defaultKind: normalizeRowValue(row.defaultKind) || '无',
    defaultValue: normalizeRowValue(row.defaultValue),
    onUpdate: normalizeRowValue(row.onUpdate) || '无',
  }));
}

interface FieldStoreState {
  rows: FieldRow[];
  setRows: (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;
  initializeRows: (persistedRows?: FieldRow[]) => void;
  resetRows: (count?: number) => void;
  handleRowsChange: (
    changes: (Handsontable.CellChange | null)[] | null,
    source: Handsontable.ChangeSource,
  ) => void;
  handleCreateRow: (index: number, amount: number) => void;
  handleRemoveRow: (index: number, amount: number) => void;
  handleAddRows: (count: number) => void;
}

export const useFieldStore = create<FieldStoreState>((set) => ({
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

    const validChanges = changes.filter(
      (change): change is Handsontable.CellChange => Array.isArray(change),
    );

    if (validChanges.length === 0) {
      return;
    }

    set((state) => {
      const nextRows = state.rows.map((row) => ({ ...row }));

      validChanges.forEach(([rowIndex]) => {
        while (nextRows.length <= rowIndex) {
          nextRows.push(createEmptyRow(nextRows.length));
        }
      });

      validChanges.forEach(([rowIndex, prop, , value]) => {
        if (typeof prop !== 'string' || prop === 'order') {
          return;
        }

        nextRows[rowIndex] = {
          ...nextRows[rowIndex],
          [prop]: normalizeRowValue(value),
        };
      });

      validChanges.forEach(([rowIndex, prop, , value]) => {
        if (prop !== 'defaultKind') {
          return;
        }

        const kind = normalizeRowValue(value);
        if (kind !== '常量') {
          nextRows[rowIndex].defaultValue = '';
        }
        if (kind === '自增') {
          nextRows[rowIndex].nullable = '否';
        }
      });

      return {
        rows: ensureOrder(nextRows),
      };
    });
  },
  handleCreateRow: (index, amount) => {
    set((state) => {
      const nextRows = state.rows.slice();
      for (let i = 0; i < amount; i += 1) {
        nextRows.splice(index + i, 0, createEmptyRow(index + i));
      }
      return { rows: ensureOrder(nextRows) };
    });
  },
  handleRemoveRow: (index, amount) => {
    set((state) => {
      const nextRows = state.rows.slice();
      nextRows.splice(index, amount);
      if (nextRows.length === 0) {
        nextRows.push(createEmptyRow(0));
      }
      return { rows: ensureOrder(nextRows) };
    });
  },
  handleAddRows: (count) => {
    const n = Math.floor(Number(count));
    const amount = Number.isFinite(n) && n > 0 ? n : 1;

    set((state) => {
      const index = state.rows.length;
      const nextRows = state.rows.slice();
      for (let i = 0; i < amount; i += 1) {
        nextRows.splice(index + i, 0, createEmptyRow(index + i));
      }
      return { rows: ensureOrder(nextRows) };
    });
  },
}));

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
