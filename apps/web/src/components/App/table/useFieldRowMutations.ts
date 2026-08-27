import { useCallback } from 'react';
import { type FieldRow, normalizeFieldNullable } from '@ddlbuilder/shared-types';

type SetRows = (value: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;

interface UseFieldRowMutationsParams {
  setRows: SetRows;
}

/**
 * 字段表格通用联动逻辑：
 * - defaultKind 变化时同步清理 defaultValue/nullable
 */
export function useFieldRowMutations({ setRows }: UseFieldRowMutationsParams) {
  const updateCellValue = useCallback(
    (rowIndex: number, columnId: string, value: string | boolean) => {
      setRows((prev) => {
        const newRows = [...prev];
        const row = { ...newRows[rowIndex] };

        if (columnId === 'nullable') {
          row.nullable = normalizeFieldNullable(value);
        } else {
          (row as Record<string, unknown>)[columnId] = value;
        }

        if (columnId === 'defaultKind') {
          if (value !== 'constant' && value !== 'expression') {
            row.defaultValue = '';
          }
          if (value === 'auto_increment') {
            row.nullable = false;
          }
          if (value === 'uuid') {
            row.onUpdate = 'none';
          }
        }

        newRows[rowIndex] = row;
        return newRows;
      });
    },
    [setRows],
  );

  return {
    updateCellValue,
  };
}
