import type { FieldRow } from '@ddlbuilder/shared-types';
import type { AISchemaChange } from '@/utils/aiSchemaChanges';

type FieldChange = Extract<AISchemaChange, { kind: 'field' }>;

const normalizedName = (value: string) => value.trim().toLowerCase();

export const applyFieldSchemaChange = (
  rows: FieldRow[],
  candidateRows: FieldRow[],
  change: FieldChange,
) => {
  if (change.type === 'add' && change.newRow) {
    const candidateIndex = candidateRows.findIndex(
      (row) => row.fieldName === change.newRow?.fieldName,
    );
    const insertIndex = candidateIndex >= 0 ? Math.min(candidateIndex, rows.length) : rows.length;
    const nextRows = rows.slice();
    nextRows.splice(insertIndex, 0, change.newRow);
    return { rows: nextRows, focusIndex: candidateIndex };
  }

  if ((change.type === 'modify' || change.type === 'rename') && change.newRow) {
    const nextRow = change.newRow;
    const targetName = change.oldFieldName || change.oldRow?.fieldName || change.fieldName;
    const focusIndex = candidateRows.findIndex((row) => row.fieldName === nextRow.fieldName);
    return {
      rows: rows.map((row) =>
        normalizedName(row.fieldName) === normalizedName(targetName) ? nextRow : row,
      ),
      focusIndex,
    };
  }

  if (change.type === 'remove') {
    const targetName = change.oldRow?.fieldName || change.fieldName;
    const focusIndex = rows.findIndex(
      (row) => normalizedName(row.fieldName) === normalizedName(targetName),
    );
    return {
      rows: rows.filter((row) => normalizedName(row.fieldName) !== normalizedName(targetName)),
      focusIndex,
    };
  }

  return { rows, focusIndex: -1 };
};
