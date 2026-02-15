import { useCallback, useMemo } from 'react';
import { COLUMN_HEADERS } from '@/utils/constants';

const FREEZE_COLUMN_KEYS = [
  'order',
  'fieldName',
  'fieldComment',
  'fieldType',
  'nullable',
  'defaultKind',
  'defaultValue',
  'onUpdate',
  'actions',
] as const;

interface UseFreezeColumnsReturn {
  getStickyLeft: (colIndex: number) => number;
  frozenAreaWidth: number;
  effectiveFreezeColumns: number;
  freezeColumnKeys: readonly string[];
}

export function useFreezeColumns(
  columnWidths: Record<string, number>,
  freezeEnabled: boolean,
  freezeColumns: number,
): UseFreezeColumnsReturn {
  const safeFreezeColumns =
    Number.isFinite(freezeColumns) && freezeColumns > 0
      ? Math.floor(freezeColumns)
      : 1;
  const effectiveFreezeColumns = Math.min(
    safeFreezeColumns,
    COLUMN_HEADERS.length,
  );

  const freezeColumnKeys = useMemo(() => FREEZE_COLUMN_KEYS, []);

  const getColumnLeftOffset = useCallback(
    (colIndex: number): number => {
      let left = 0;
      for (let i = 0; i < Math.min(colIndex, freezeColumnKeys.length); i++) {
        left += columnWidths[freezeColumnKeys[i]] || 100;
      }
      return left;
    },
    [columnWidths, freezeColumnKeys],
  );

  const getStickyLeft = useCallback(
    (colIndex: number): number => {
      if (!freezeEnabled || colIndex >= effectiveFreezeColumns) return 0;
      return getColumnLeftOffset(colIndex);
    },
    [freezeEnabled, effectiveFreezeColumns, getColumnLeftOffset],
  );

  const frozenAreaWidth =
    freezeEnabled && effectiveFreezeColumns > 0
      ? getColumnLeftOffset(effectiveFreezeColumns)
      : 0;

  return {
    getStickyLeft,
    frozenAreaWidth,
    effectiveFreezeColumns,
    freezeColumnKeys,
  };
}
