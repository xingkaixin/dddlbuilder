import { useCallback } from 'react';
import type { ClipboardEvent } from 'react';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { createEmptyRow, normalizeFieldCellValue } from '@/utils/helpers';

interface UseDataTableClipboardParams {
  rows: FieldRow[];
  setRows: (value: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;
  selectedCell: { row: number; col: string } | null;
  editableColumnKeys: readonly string[];
  clearSelection: () => void;
}

export function useDataTableClipboard({
  rows,
  setRows,
  selectedCell,
  editableColumnKeys,
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
      const startCol = selectedCell ? Math.max(0, editableColumnKeys.indexOf(selectedCell.col)) : 0;

      const newRows = [...rows];

      pastedRows.forEach((cols, rowOffset) => {
        const targetRowIndex = startRow + rowOffset;

        while (newRows.length <= targetRowIndex) {
          newRows.push(createEmptyRow());
        }

        const row = { ...newRows[targetRowIndex] };
        cols.forEach((cellValue, colOffset) => {
          const targetColIndex = startCol + colOffset;
          if (targetColIndex >= editableColumnKeys.length) return;

          const key = editableColumnKeys[targetColIndex];
          const value = cellValue?.trim() || '';

          (row as Record<string, unknown>)[key] = normalizeFieldCellValue(key, value);
        });
        newRows[targetRowIndex] = row;
      });

      setRows(newRows);

      clearSelection();
    },
    [setRows, selectedCell, rows, editableColumnKeys, clearSelection],
  );

  return { handlePaste };
}
