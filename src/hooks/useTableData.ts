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
    source: Handsontable.ChangeSource,
  ) => void;
  handleCreateRow: (index: number, amount: number) => void;
  handleRemoveRow: (index: number, amount: number) => void;
  handleAddRows: (count: number) => void;
}

export function useTableData(
  initialRows: FieldRow[],
  persistedRows?: FieldRow[],
): UseTableDataReturn {
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

  // 处理器函数：验证变更数据
  const validateChanges = useCallback(
    (
      // rows: FieldRow[],
      changes: Handsontable.CellChange[] | null,
    ): { isValid: boolean; changes: Handsontable.CellChange[] } => {
      if (!changes) {
        return { isValid: false, changes: [] };
      }
      return { isValid: true, changes };
    },
    [],
  );

  // 处理器函数：确保行存在
  const ensureRowExists = useCallback(
    (rows: FieldRow[], changes: Handsontable.CellChange[]): FieldRow[] => {
      const next = rows.map((row) => ({ ...row }));
      changes.forEach(([rowIndex]) => {
        while (next.length <= rowIndex) {
          next.push(createEmptyRow(next.length));
        }
      });
      return next;
    },
    [],
  );

  // 处理器函数：更新字段值
  const updateFieldValue = useCallback(
    (rows: FieldRow[], changes: Handsontable.CellChange[]): FieldRow[] => {
      const next = rows.map((row) => ({ ...row }));
      changes.forEach(([rowIndex, prop, , value]) => {
        if (typeof prop !== "string" || prop === "order") {
          return;
        }
        next[rowIndex] = {
          ...next[rowIndex],
          [prop]: value == null ? "" : String(value),
        };
      });
      return next;
    },
    [],
  );

  // 处理器函数：处理特殊字段逻辑
  const handleSpecialFieldLogic = useCallback(
    (rows: FieldRow[], changes: Handsontable.CellChange[]): FieldRow[] => {
      const next = rows.map((row) => ({ ...row }));
      changes.forEach(([rowIndex, prop, , value]) => {
        if (typeof prop !== "string" || prop !== "defaultKind") {
          return;
        }
        const kind = String(value ?? "");
        if (kind !== "常量") {
          next[rowIndex].defaultValue = "";
        }
        if (kind === "自增") {
          next[rowIndex].nullable = "否";
        }
      });
      return next;
    },
    [],
  );

  // 处理器函数：确保顺序
  const ensureOrderProcessor = useCallback((rows: FieldRow[]): FieldRow[] => {
    return ensureOrder(rows);
  }, []);

  // 责任链：按顺序处理变更
  const handleChangeChain = useCallback(
    (rows: FieldRow[], changes: Handsontable.CellChange[]): FieldRow[] => {
      const processors = [
        (r: FieldRow[]) => r, // 占位符，实际处理在下面
        (r: FieldRow[]) => ensureRowExists(r, changes),
        (r: FieldRow[]) => updateFieldValue(r, changes),
        (r: FieldRow[]) => handleSpecialFieldLogic(r, changes),
        ensureOrderProcessor,
      ];

      return processors.reduce((acc, processor) => processor(acc), rows);
    },
    [
      ensureRowExists,
      updateFieldValue,
      handleSpecialFieldLogic,
      ensureOrderProcessor,
    ],
  );

  const handleRowsChange = useCallback(
    (
      changes: Handsontable.CellChange[] | null,
      source: Handsontable.ChangeSource,
    ) => {
      // 验证变更
      const { isValid, changes: validChanges } = validateChanges(changes);

      // 早期返回：无效变更或加载数据源
      if (!isValid || source === "loadData") {
        return;
      }

      // 使用责任链处理变更
      setRows((prev) => {
        return handleChangeChain(prev, validChanges);
      });
    },
    [validateChanges, handleChangeChain],
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
