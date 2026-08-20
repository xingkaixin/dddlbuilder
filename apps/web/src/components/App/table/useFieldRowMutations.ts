import { useCallback } from 'react';
import { type FieldRow, normalizeFieldNullable } from '@ddlbuilder/shared-types';

type SetRows = (value: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;

interface UseFieldRowMutationsParams {
  rows: FieldRow[];
  setRows: SetRows;
  onFieldRename?: (oldFieldName: string, newFieldName: string) => void;
}

/**
 * 字段表格通用联动逻辑：
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
          row.nullable = normalizeFieldNullable(value);
        } else {
          (row as Record<string, unknown>)[columnId] = value;
        }

        if (columnId === 'defaultKind') {
          if (value !== 'constant') {
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
      window.setTimeout(() => {
        window.dispatchEvent(new Event('ddlbuilder:field-rows-committed'));
      }, 0);
      window.setTimeout(() => {
        window.dispatchEvent(new Event('ddlbuilder:field-rows-committed'));
      }, 250);
    },
    [rows, setRows, onFieldRename],
  );

  return {
    updateCellValue,
  };
}
