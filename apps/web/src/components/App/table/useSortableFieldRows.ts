import { useCallback, useMemo, useRef } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { FieldRow } from '@ddlbuilder/shared-types';
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

  const oldIndex = rows.findIndex((row) => row.id === activeId);
  const newIndex = rows.findIndex((row) => row.id === overId);

  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return rows;
  }

  return ensureOrder(arrayMove(rows, oldIndex, newIndex));
};

export function useSortableFieldRows({ rows, setRows, onDragResult }: UseSortableFieldRowsParams) {
  const lastOverIdRef = useRef<string | null>(null);

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

  const rowIds = useMemo(() => rows.map((row) => row.id), [rows]);

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    if (event.over) {
      lastOverIdRef.current = String(event.over.id);
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      const activeId = String(active.id);
      const overId = over ? String(over.id) : lastOverIdRef.current;
      const moved =
        Boolean(overId) &&
        activeId !== overId &&
        rows.findIndex((row) => row.id === activeId) >= 0 &&
        rows.findIndex((row) => row.id === overId) >= 0;

      setRows((prev) => reorderFieldRowsByIds(prev, activeId, overId));
      onDragResult?.({
        moved,
        activeId,
        overId,
      });
      lastOverIdRef.current = null;
    },
    [onDragResult, rows, setRows],
  );

  return {
    sensors,
    rowIds,
    handleDragMove,
    handleDragEnd,
  };
}
