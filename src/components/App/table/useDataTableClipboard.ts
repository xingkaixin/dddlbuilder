import { useCallback } from 'react';
import type { ClipboardEvent } from 'react';
import type { FieldRow } from '@/types';

const parseNullable = (value: string): string => {
  if (!value) return '是';
  const v = value.trim().toLowerCase();
  const notNullableValues = new Set(['n', 'no', '否', 'false', '0', 'not null', 'notnull']);
  if (notNullableValues.has(v)) {
    return '否';
  }
  return '是';
};

interface UseDataTableClipboardParams {
  rows: FieldRow[];
  setRows: (value: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;
  selectedCell: { row: number; col: number } | null;
  editableColumnKeys: readonly [
    'fieldName',
    'fieldComment',
    'fieldType',
    'nullable',
    'defaultKind',
    'defaultValue',
    'onUpdate',
  ];
  syncFieldRenameDependencies: (oldFieldName: string, newFieldName: string) => void;
  clearSelection: () => void;
}

export function useDataTableClipboard({
  rows,
  setRows,
  selectedCell,
  editableColumnKeys,
  syncFieldRenameDependencies,
  clearSelection,
}: UseDataTableClipboardParams) {
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData?.getData('text/plain');
      if (!clipboardData) return;

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const pastedRows = clipboardData
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => line.split('\t'));

      if (pastedRows.length === 0) return;

      e.preventDefault();

      const startRow = selectedCell?.row ?? rows.length;
      const startCol = selectedCell?.col ?? 0;

      const renamePairs: Array<{ oldName: string; newName: string }> = [];
      const newRows = [...rows];

      pastedRows.forEach((cols, rowOffset) => {
        const targetRowIndex = startRow + rowOffset;

        while (newRows.length <= targetRowIndex) {
          newRows.push({
            order: newRows.length + 1,
            fieldName: '',
            fieldComment: '',
            fieldType: '',
            nullable: '是',
            defaultKind: '无',
            defaultValue: '',
            onUpdate: '无',
          });
        }

        const row = { ...newRows[targetRowIndex] };
        cols.forEach((cellValue, colOffset) => {
          const targetColIndex = startCol + colOffset;
          if (targetColIndex >= editableColumnKeys.length) return;

          const key = editableColumnKeys[targetColIndex];
          const value = cellValue?.trim() || '';

          if (key === 'fieldName') {
            const oldName = row.fieldName || '';
            const newName = value;
            if (oldName && newName && oldName !== newName) {
              renamePairs.push({ oldName, newName });
            }
          }

          if (key === 'nullable') {
            row.nullable = parseNullable(value);
          } else {
            (row as Record<string, unknown>)[key] =
              value || (key === 'defaultKind' || key === 'onUpdate' ? '无' : '');
          }
        });
        newRows[targetRowIndex] = row;
      });

      setRows(newRows.map((row, idx) => ({ ...row, order: idx + 1 })));

      renamePairs.forEach(({ oldName, newName }) => {
        syncFieldRenameDependencies(oldName, newName);
      });

      clearSelection();
    },
    [setRows, selectedCell, rows, editableColumnKeys, syncFieldRenameDependencies, clearSelection],
  );

  return { handlePaste };
}
