import { useState, useCallback, useMemo, useEffect } from 'react';
import type { FieldRow, NormalizedField } from '@ddlbuilder/shared-types';
import {
  toStringSafe,
  createEmptyRow,
  normalizeFieldCellValue,
  normalizeFields,
} from '@/utils/helpers';
import type { TableCellChange, TableChangeSource } from '@/types/tableChanges';

export interface UseTableDataReturn {
  rows: FieldRow[];
  duplicateNameSet: Set<string>;
  normalizedFields: NormalizedField[];
  resetTableRows: () => void;
  handleRowsChange: (changes: TableCellChange[] | null, source: TableChangeSource) => void;
  handleCreateRow: (index: number, amount: number) => void;
  handleRemoveRow: (index: number, amount: number) => void;
  handleAddRows: (count: number) => void;
  setRows: React.Dispatch<React.SetStateAction<FieldRow[]>>;
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

  const resetTableRows = useCallback(() => {
    setRows(() => Array.from({ length: initialRows.length }, () => createEmptyRow()));
  }, [initialRows]);

  // 处理器函数：验证变更数据
  const validateChanges = useCallback(
    (
      // rows: FieldRow[],
      changes: TableCellChange[] | null,
    ): { isValid: boolean; changes: TableCellChange[] } => {
      if (!changes) {
        return { isValid: false, changes: [] };
      }
      return { isValid: true, changes };
    },
    [],
  );

  // 处理器函数：确保行存在
  const ensureRowExists = useCallback(
    (rows: FieldRow[], changes: TableCellChange[]): FieldRow[] => {
      const next = rows.map((row) => ({ ...row }));
      changes.forEach(([rowIndex]) => {
        while (next.length <= rowIndex) {
          next.push(createEmptyRow());
        }
      });
      return next;
    },
    [],
  );

  // 处理器函数：更新字段值
  const updateFieldValue = useCallback(
    (rows: FieldRow[], changes: TableCellChange[]): FieldRow[] => {
      const next = rows.map((row) => ({ ...row }));
      changes.forEach(([rowIndex, prop, , value]) => {
        if (typeof prop !== 'string' || prop === 'order') {
          return;
        }
        next[rowIndex] = {
          ...next[rowIndex],
          [prop]: normalizeFieldCellValue(prop, value),
        };
      });
      return next;
    },
    [],
  );

  // 处理器函数：处理特殊字段逻辑
  const handleSpecialFieldLogic = useCallback(
    (rows: FieldRow[], changes: TableCellChange[]): FieldRow[] => {
      const next = rows.map((row) => ({ ...row }));
      changes.forEach(([rowIndex, prop, , value]) => {
        if (typeof prop !== 'string' || prop !== 'defaultKind') {
          return;
        }
        if (value !== 'constant') {
          next[rowIndex].defaultValue = '';
        }
        if (value === 'auto_increment') {
          next[rowIndex].nullable = false;
        }
      });
      return next;
    },
    [],
  );

  // 责任链：按顺序处理变更
  const handleChangeChain = useCallback(
    (rows: FieldRow[], changes: TableCellChange[]): FieldRow[] => {
      const processors = [
        (r: FieldRow[]) => r, // 占位符，实际处理在下面
        (r: FieldRow[]) => ensureRowExists(r, changes),
        (r: FieldRow[]) => updateFieldValue(r, changes),
        (r: FieldRow[]) => handleSpecialFieldLogic(r, changes),
      ];

      return processors.reduce((acc, processor) => processor(acc), rows);
    },
    [ensureRowExists, updateFieldValue, handleSpecialFieldLogic],
  );

  const handleRowsChange = useCallback(
    (changes: TableCellChange[] | null, source: TableChangeSource) => {
      // 验证变更
      const { isValid, changes: validChanges } = validateChanges(changes);

      // 早期返回：无效变更或加载数据源
      if (!isValid || source === 'loadData') {
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
        next.splice(index + i, 0, createEmptyRow());
      }
      return next;
    });
  }, []);

  const handleRemoveRow = useCallback((index: number, amount: number) => {
    setRows((prev) => {
      const next = prev.slice();
      next.splice(index, amount);
      if (next.length === 0) {
        next.push(createEmptyRow());
      }
      return next;
    });
  }, []);

  const handleAddRows = useCallback((count: number) => {
    const n = Math.floor(Number(count));
    const amount = Number.isFinite(n) && n > 0 ? n : 1;
    setRows((prev) => {
      const index = prev.length;
      const next = prev.slice();
      for (let i = 0; i < amount; i += 1) {
        next.splice(index + i, 0, createEmptyRow());
      }
      return next;
    });
  }, []);

  return {
    rows,
    duplicateNameSet,
    normalizedFields,
    resetTableRows,
    handleRowsChange,
    handleCreateRow,
    handleRemoveRow,
    handleAddRows,
    setRows,
  };
}
