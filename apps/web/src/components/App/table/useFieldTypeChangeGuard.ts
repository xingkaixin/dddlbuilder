import { useCallback, useReducer } from 'react';
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

type PendingChangeEvent = { type: 'riskDetected'; change: PendingChange } | { type: 'resolved' };

const pendingChangeReducer = (_pending: PendingChange | null, event: PendingChangeEvent) =>
  event.type === 'riskDetected' ? event.change : null;

/**
 * Wraps updateCellValue to intercept dangerous fieldType changes.
 * When the new type triggers a risk, the change is held in pendingChange
 * until the user confirms or cancels via handleConfirm / handleCancel.
 */
export function useFieldTypeChangeGuard(
  getRows: () => FieldRow[],
  updateCellValue: UpdateCellValue,
): FieldTypeChangeGuard {
  const [pendingChange, dispatch] = useReducer(pendingChangeReducer, null);

  const guardedUpdateCellValue = useCallback<UpdateCellValue>(
    (...args) => {
      const [rowIndex, columnId, value] = args;

      if (columnId === 'fieldType') {
        const oldType = getRows()[rowIndex]?.fieldType ?? '';

        if (oldType) {
          const risk = detectFieldTypeRisk(oldType, value);

          if (risk) {
            dispatch({ type: 'riskDetected', change: { rowIndex, newType: value, risk } });

            return;
          }
        }
      }

      updateCellValue(...args);
    },
    [getRows, updateCellValue],
  );

  const handleConfirm = useCallback(() => {
    if (!pendingChange) return;
    updateCellValue(pendingChange.rowIndex, 'fieldType', pendingChange.newType);
    dispatch({ type: 'resolved' });
  }, [pendingChange, updateCellValue]);

  const handleCancel = useCallback(() => {
    dispatch({ type: 'resolved' });
  }, []);

  return { guardedUpdateCellValue, pendingChange, handleConfirm, handleCancel };
}
