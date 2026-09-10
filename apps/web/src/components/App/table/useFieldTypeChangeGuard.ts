import { useState, useCallback } from 'react';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { detectFieldTypeRisk, type FieldTypeRisk } from '@/utils/fieldTypeRisk';
import type { UpdateEditableField } from './useFieldRowMutations';

type UpdateCellValue = UpdateEditableField;

type PendingChange = {
  rowIndex: number;
  newType: string;
  risk: FieldTypeRisk;
};

export type FieldTypeChangeGuard = {
  guardedUpdateCellValue: UpdateCellValue;
  pendingChange: PendingChange | null;
  handleConfirm: () => void;
  handleCancel: () => void;
};

/**
 * Wraps updateCellValue to intercept dangerous fieldType changes.
 * When the new type triggers a risk, the change is held in pendingChange
 * until the user confirms or cancels via handleConfirm / handleCancel.
 */
export function useFieldTypeChangeGuard(
  rows: FieldRow[],
  updateCellValue: UpdateCellValue,
): FieldTypeChangeGuard {
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  const guardedUpdateCellValue = useCallback<UpdateCellValue>(
    (...args) => {
      const [rowIndex, columnId, value] = args;

      if (columnId === 'fieldType') {
        const oldType = rows[rowIndex]?.fieldType ?? '';

        if (oldType) {
          const risk = detectFieldTypeRisk(oldType, value);

          if (risk) {
            setPendingChange({ rowIndex, newType: value, risk });

            return;
          }
        }
      }

      updateCellValue(...args);
    },
    [rows, updateCellValue],
  );

  const handleConfirm = useCallback(() => {
    if (!pendingChange) return;
    updateCellValue(pendingChange.rowIndex, 'fieldType', pendingChange.newType);
    setPendingChange(null);
  }, [pendingChange, updateCellValue]);

  const handleCancel = useCallback(() => {
    setPendingChange(null);
  }, []);

  return { guardedUpdateCellValue, pendingChange, handleConfirm, handleCancel };
}
