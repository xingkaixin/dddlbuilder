import { useCallback, useMemo } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { FieldRow } from '@/types';
import { ensureOrder } from '@/utils/helpers';

type SetRows = (next: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;

interface UseSortableFieldRowsParams {
  rows: FieldRow[];
  setRows: SetRows;
  onDragResult?: (result: { moved: boolean; activeId: string; overId: string | null }) => void;
}

export const reorderFieldRowsByIds = (
  rows: FieldRow[],
  activeId: string,
  overId: string | null,
) => {
  if (!overId || activeId === overId) {
    return rows;
  }

  const oldIndex = rows.findIndex((row) => String(row.order) === activeId);
  const newIndex = rows.findIndex((row) => String(row.order) === overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return rows;
  }

  return ensureOrder(arrayMove(rows, oldIndex, newIndex));
};

export function useSortableFieldRows({ rows, setRows, onDragResult }: UseSortableFieldRowsParams) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const rowIds = useMemo(() => rows.map((row) => String(row.order)), [rows]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);
      const overId = over ? String(over.id) : null;
      const moved =
        Boolean(overId) &&
        activeId !== overId &&
        rows.findIndex((row) => String(row.order) === activeId) >= 0 &&
        rows.findIndex((row) => String(row.order) === overId) >= 0;

      setRows((prev) => reorderFieldRowsByIds(prev, activeId, overId));
      onDragResult?.({
        moved,
        activeId,
        overId,
      });
    },
    [onDragResult, rows, setRows],
  );

  return {
    sensors,
    rowIds,
    handleDragEnd,
  };
}
