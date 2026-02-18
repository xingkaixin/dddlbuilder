import { useCallback, useState } from 'react';
import type { RefObject } from 'react';

interface SelectedCell {
  row: number;
  col: number;
}

interface UseDataTableNavigationParams {
  rowsLength: number;
  editableColumnCount: number;
  tableRef: RefObject<HTMLDivElement | null>;
}

export function useDataTableNavigation({
  rowsLength,
  editableColumnCount,
  tableRef,
}: UseDataTableNavigationParams) {
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);

  const focusFirstInteractiveInCell = useCallback(
    (cellElement: HTMLTableCellElement | null) => {
      const focusTarget = cellElement?.querySelector<HTMLElement>(
        'input:not([disabled]), div[tabindex="0"], button:not([disabled])',
      );
      focusTarget?.focus();
    },
    [],
  );

  const handleCellActivate = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (colIndex >= 1 && colIndex <= editableColumnCount) {
        const nextCol = colIndex - 1;
        setSelectedCell((prev) => {
          if (prev?.row === rowIndex && prev.col === nextCol) {
            return prev;
          }
          return { row: rowIndex, col: nextCol };
        });
      }
    },
    [editableColumnCount],
  );

  const focusEditableCell = useCallback(
    (rowIndex: number, editableColIndex: number) => {
      if (rowIndex < 0 || rowIndex >= rowsLength) return;
      if (editableColIndex < 0 || editableColIndex >= editableColumnCount)
        return;

      const tableColIndex = editableColIndex + 1;
      const cellElement = tableRef.current?.querySelector<HTMLTableCellElement>(
        `td[data-row-index="${rowIndex}"][data-col-index="${tableColIndex}"]`,
      );
      if (!cellElement) return;

      handleCellActivate(rowIndex, tableColIndex);
      focusFirstInteractiveInCell(cellElement);
    },
    [
      rowsLength,
      editableColumnCount,
      tableRef,
      handleCellActivate,
      focusFirstInteractiveInCell,
    ],
  );

  const handleTabNavigation = useCallback(
    (rowIndex: number, editableColIndex: number, direction: 1 | -1) => {
      let nextRow = rowIndex;
      let nextCol = editableColIndex + direction;
      const lastEditableCol = editableColumnCount - 1;

      while (nextRow >= 0 && nextRow < rowsLength) {
        if (nextCol > lastEditableCol) {
          nextRow += 1;
          nextCol = 0;
          continue;
        }
        if (nextCol < 0) {
          nextRow -= 1;
          nextCol = lastEditableCol;
          continue;
        }
        focusEditableCell(nextRow, nextCol);
        return;
      }
    },
    [editableColumnCount, rowsLength, focusEditableCell],
  );

  return {
    selectedCell,
    setSelectedCell,
    focusFirstInteractiveInCell,
    handleCellActivate,
    handleTabNavigation,
  };
}
