import { useCallback } from 'react';
import type { ClipboardEvent } from 'react';
import {
  type FieldRow,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';
import { createEmptyRow } from '@/utils/helpers';
import type { EditableFieldKey } from './useFieldRowMutations';

interface UseDataTableClipboardParams {
  rows: FieldRow[];
  setRows: (value: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;
  selectedCell: { row: number; col: string } | null;
  editableColumnKeys: readonly EditableFieldKey[];
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

      const startCol = selectedCell
        ? Math.max(
            0,
            editableColumnKeys.findIndex((key) => key === selectedCell.col),
          )
        : 0;

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

          switch (key) {
            case 'fieldName':
            case 'fieldComment':
            case 'fieldType':
            case 'defaultValue':
              row[key] = value;
              break;
            case 'nullable':
              row.nullable = normalizeFieldNullable(value);
              break;
            case 'defaultKind':
              row.defaultKind = normalizeFieldDefaultKind(value);
              break;
            case 'onUpdate':
              row.onUpdate = normalizeFieldOnUpdate(value);
              break;
          }
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
