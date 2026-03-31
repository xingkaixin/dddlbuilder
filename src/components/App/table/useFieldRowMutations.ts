import { useCallback } from 'react';
import type { FieldRow } from '@/types';

type SetRows = (value: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;

interface UseFieldRowMutationsParams {
  rows: FieldRow[];
  setRows: SetRows;
  onFieldRename?: (oldFieldName: string, newFieldName: string) => void;
}

/**
 * 字段表格通用联动逻辑：
 * - nullable 使用勾选框时统一映射为“是/否”
 * - defaultKind 变化时同步清理 defaultValue/nullable
 * - 可选触发字段改名联动回调（索引/分区/分片依赖）
 */
export function useFieldRowMutations({ rows, setRows, onFieldRename }: UseFieldRowMutationsParams) {
  const updateCellValue = useCallback(
    (rowIndex: number, columnId: string, value: string | boolean) => {
      if (columnId === 'fieldName') {
        const oldFieldName = rows[rowIndex]?.fieldName || '';
        const newFieldName = String(value ?? '');
        onFieldRename?.(oldFieldName, newFieldName);
      }

      setRows((prev) => {
        const newRows = [...prev];
        const row = { ...newRows[rowIndex] };

        if (columnId === 'nullable') {
          row.nullable = value ? '是' : '否';
        } else {
          (row as Record<string, unknown>)[columnId] = value;
        }

        if (columnId === 'defaultKind') {
          const kind = String(value ?? '');
          if (kind !== '常量') {
            row.defaultValue = '';
          }
          if (kind === '自增') {
            row.nullable = '否';
          }
          if (kind === 'uuid') {
            row.onUpdate = '无';
          }
        }

        newRows[rowIndex] = row;
        return newRows;
      });
    },
    [rows, setRows, onFieldRename],
  );

  return {
    updateCellValue,
  };
}
