import { useCallback } from 'react';
import {
  type FieldRow,
  normalizeFieldDefaultKind,
  normalizeFieldNullable,
  normalizeFieldOnUpdate,
} from '@ddlbuilder/shared-types';

type SetRows = (value: FieldRow[] | ((prev: FieldRow[]) => FieldRow[])) => void;

interface UseFieldRowMutationsParams {
  setRows: SetRows;
}

export type EditableFieldValues = {
  fieldName: string;
  fieldComment: string;
  fieldType: string;
  nullable: string | boolean;
  defaultKind: string;
  defaultValue: string;
  onUpdate: string;
};

export type EditableFieldKey = keyof EditableFieldValues;

export type EditableFieldUpdateArgs = {
  [K in EditableFieldKey]: [rowIndex: number, columnId: K, value: EditableFieldValues[K]];
}[EditableFieldKey];

export type UpdateEditableField = (...args: EditableFieldUpdateArgs) => void;

/**
 * 字段表格通用联动逻辑：
 * - defaultKind 变化时同步清理 defaultValue/nullable
 */
export function useFieldRowMutations({ setRows }: UseFieldRowMutationsParams) {
  const updateCellValue = useCallback<UpdateEditableField>(
    (...args) => {
      const [rowIndex, columnId] = args;
      setRows((prev) => {
        const newRows = [...prev];
        const row = { ...newRows[rowIndex] };

        switch (columnId) {
          case 'fieldName':
          case 'fieldComment':
          case 'fieldType':
          case 'defaultValue':
            row[columnId] = args[2];
            break;
          case 'nullable':
            row.nullable = normalizeFieldNullable(args[2]);
            break;
          case 'defaultKind':
            row.defaultKind = normalizeFieldDefaultKind(args[2]);
            break;
          case 'onUpdate':
            row.onUpdate = normalizeFieldOnUpdate(args[2]);
            break;
        }

        if (columnId === 'defaultKind') {
          if (args[2] !== 'constant' && args[2] !== 'expression') {
            row.defaultValue = '';
          }

          if (args[2] === 'auto_increment') {
            row.nullable = false;
          }

          if (args[2] === 'uuid') {
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
