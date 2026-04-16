import { useEffect } from 'react';

export function useRowHighlight(
  tableRef: React.RefObject<HTMLDivElement | null>,
  highlightedRowIndex: number | null | undefined,
): void {
  useEffect(() => {
    if (highlightedRowIndex == null || highlightedRowIndex < 0) return;

    const rowElement = tableRef.current?.querySelector(`[data-row-index="${highlightedRowIndex}"]`);
    if (!rowElement) return;

    rowElement.classList.add('animate-row-highlight');

    const timeout = setTimeout(() => {
      rowElement.classList.remove('animate-row-highlight');
    }, 1200);

    return () => clearTimeout(timeout);
  }, [highlightedRowIndex, tableRef]);
}
