import { useCallback, useReducer, type RefObject } from 'react';

interface SelectedCell {
  row: number;
  col: string;
}

type SelectionEvent = { type: 'cellActivated'; row: number; col: string } | { type: 'cleared' };

function selectedCellReducer(
  selected: SelectedCell | null,
  event: SelectionEvent,
): SelectedCell | null {
  if (event.type === 'cleared') return null;

  if (selected?.row === event.row && selected.col === event.col) return selected;

  return { row: event.row, col: event.col };
}

const INTERACTIVE_SELECTOR = 'input:not([disabled]), div[tabindex="0"], button:not([disabled])';

export function useDataTableNavigation({
  tableRef,
}: {
  tableRef: RefObject<HTMLDivElement | null>;
}) {
  const [selectedCell, dispatch] = useReducer(selectedCellReducer, null);

  const focusFirstInteractiveInCell = useCallback((cell: HTMLTableCellElement | null) => {
    cell?.querySelector<HTMLElement>(INTERACTIVE_SELECTOR)?.focus();
  }, []);

  const handleCellActivate = useCallback((row: number, col: string) => {
    dispatch({ type: 'cellActivated', row, col });
  }, []);

  const clearSelection = useCallback(() => dispatch({ type: 'cleared' }), []);

  const focusEditableCell = useCallback(
    (row: number, col: string) => {
      const cell = Array.from(
        tableRef.current?.querySelectorAll<HTMLTableCellElement>('td[data-editable-column]') ?? [],
      ).find((cell) => Number(cell.dataset.rowIndex) === row && cell.dataset.columnId === col);

      if (!cell) return;
      handleCellActivate(row, col);
      focusFirstInteractiveInCell(cell);
    },
    [tableRef, handleCellActivate, focusFirstInteractiveInCell],
  );

  const handleTabNavigation = useCallback(
    (row: number, col: string, direction: 1 | -1) => {
      const cells = Array.from(
        tableRef.current?.querySelectorAll<HTMLTableCellElement>('td[data-editable-column]') ?? [],
      );
      const current = cells.findIndex(
        (cell) => Number(cell.dataset.rowIndex) === row && cell.dataset.columnId === col,
      );

      if (current < 0) return;

      for (
        let index = current + direction;
        index >= 0 && index < cells.length;
        index += direction
      ) {
        const cell = cells[index];
        const columnId = cell.dataset.columnId;

        if (!columnId || !cell.querySelector(INTERACTIVE_SELECTOR)) continue;
        handleCellActivate(Number(cell.dataset.rowIndex), columnId);
        focusFirstInteractiveInCell(cell);

        return;
      }
    },
    [tableRef, handleCellActivate, focusFirstInteractiveInCell],
  );

  return {
    selectedCell,
    clearSelection,
    focusEditableCell,
    focusFirstInteractiveInCell,
    handleCellActivate,
    handleTabNavigation,
  };
}
