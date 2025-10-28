import { useState, useCallback, useMemo, useEffect } from "react";
import type Handsontable from "handsontable";
import type { FieldRow, NormalizedField } from "@/types";
import {
  toStringSafe,
  createEmptyRow,
  ensureOrder,
  normalizeFields,
} from "@/utils/helpers";

export interface UseTableDataReturn {
  rows: FieldRow[];
  duplicateNameSet: Set<string>;
  normalizedFields: NormalizedField[];
  handleRowsChange: (
    changes: Handsontable.CellChange[] | null,
    source: Handsontable.ChangeSource
  ) => void;
  handleCreateRow: (index: number, amount: number) => void;
  handleRemoveRow: (index: number, amount: number) => void;
  handleAddRows: (count: number) => void;
}

export function useTableData(initialRows: FieldRow[], persistedRows?: FieldRow[]): UseTableDataReturn {
  const [rows, setRows] = useState<FieldRow[]>(initialRows);
  const [initialized, setInitialized] = useState(false);

  // Update rows when persisted data becomes available
  useEffect(() => {
    if (persistedRows && !initialized) {
      setRows(persistedRows);
      setInitialized(true);
    }
  }, [persistedRows, initialized]);

  const duplicateNameSet = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((r) => {
      const name = toStringSafe(r.fieldName).trim();
      if (!name) return;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    });
    const dups = new Set<string>();
    counts.forEach((count, name) => {
      if (count > 1) dups.add(name);
    });
    return dups;
  }, [rows]);

  const normalizedFields = useMemo(() => normalizeFields(rows), [rows]);

  const handleRowsChange = useCallback(
    (
      changes: Handsontable.CellChange[] | null,
      source: Handsontable.ChangeSource
    ) => {
      if (!changes || source === "loadData") {
        return;
      }
      setRows((prev) => {
        const next = prev.map((row) => ({ ...row }));
        changes.forEach(([rowIndex, prop, , value]) => {
          if (typeof prop !== "string" || prop === "order") {
            return;
          }
          while (next.length <= rowIndex) {
            next.push(createEmptyRow(next.length));
          }
          next[rowIndex] = {
            ...next[rowIndex],
            [prop]: value == null ? "" : String(value),
          };
          if (prop === "defaultKind") {
            const kind = String(value ?? "");
            if (kind !== "常量") {
              next[rowIndex].defaultValue = "";
            }
            if (kind === "自增") {
              next[rowIndex].nullable = "否";
            }
          }
        });
        return ensureOrder(next);
      });
    },
    []
  );

  const handleCreateRow = useCallback((index: number, amount: number) => {
    setRows((prev) => {
      const next = prev.slice();
      for (let i = 0; i < amount; i += 1) {
        next.splice(index + i, 0, createEmptyRow(index + i));
      }
      return ensureOrder(next);
    });
  }, []);

  const handleRemoveRow = useCallback((index: number, amount: number) => {
    setRows((prev) => {
      const next = prev.slice();
      next.splice(index, amount);
      if (next.length === 0) {
        next.push(createEmptyRow(0));
      }
      return ensureOrder(next);
    });
  }, []);

  const handleAddRows = useCallback((count: number) => {
    const n = Math.floor(Number(count));
    const amount = Number.isFinite(n) && n > 0 ? n : 1;
    setRows((prev) => {
      const index = prev.length;
      const next = prev.slice();
      for (let i = 0; i < amount; i += 1) {
        next.splice(index + i, 0, createEmptyRow(index + i));
      }
      return ensureOrder(next);
    });
  }, []);

  return {
    rows,
    duplicateNameSet,
    normalizedFields,
    handleRowsChange,
    handleCreateRow,
    handleRemoveRow,
    handleAddRows,
  };
}