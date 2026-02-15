import { useMemo } from 'react';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import { EditableCell, SelectCell, CheckboxCell, OrderCell } from './index';
import { RowActions } from './RowActions';
import type { DatabaseType, FieldRow, UiDefaultKind } from '@/types';
import {
  toStringSafe,
  normalizeDefaultKind,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
} from '@/utils/helpers';
import { getCanonicalBaseType } from '@/utils/databaseTypeMapping';
import { COLUMN_HEADERS } from '@/utils/constants';

const columnHelper = createColumnHelper<FieldRow>();

interface UseFieldColumnsParams {
  columnWidths: Record<string, number>;
  rowWarnings: string[][];
  dbType: DatabaseType;
  updateCellValue: (
    rowIndex: number,
    columnId: string,
    value: string | boolean,
  ) => void;
  handleTabNavigation: (
    rowIndex: number,
    editableColIndex: number,
    direction: 1 | -1,
  ) => void;
  onRemoveRow: (rowIndex: number, count: number) => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useFieldColumns(
  params: UseFieldColumnsParams,
): ColumnDef<FieldRow, any>[] {
  const {
    columnWidths,
    rowWarnings,
    dbType,
    updateCellValue,
    handleTabNavigation,
    onRemoveRow,
  } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useMemo<ColumnDef<FieldRow, any>[]>(
    () => [
      columnHelper.accessor('order', {
        header: () => COLUMN_HEADERS[0],
        size: columnWidths.order,
        cell: ({ row }) => (
          <OrderCell
            order={row.original.order}
            warnings={rowWarnings[row.index] || []}
          />
        ),
      }),
      columnHelper.accessor('fieldName', {
        header: () => COLUMN_HEADERS[1],
        size: columnWidths.fieldName,
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldName', v)}
            onTabNavigate={(direction) =>
              handleTabNavigation(row.index, 0, direction)
            }
            placeholder="字段名"
          />
        ),
      }),
      columnHelper.accessor('fieldComment', {
        header: () => COLUMN_HEADERS[2],
        size: columnWidths.fieldComment,
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldComment', v)}
            onTabNavigate={(direction) =>
              handleTabNavigation(row.index, 1, direction)
            }
            placeholder="字段中文名"
          />
        ),
      }),
      columnHelper.accessor('fieldType', {
        header: () => COLUMN_HEADERS[3],
        size: columnWidths.fieldType,
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldType', v)}
            onTabNavigate={(direction) =>
              handleTabNavigation(row.index, 2, direction)
            }
            placeholder="字段类型"
          />
        ),
      }),
      columnHelper.accessor('nullable', {
        header: () => COLUMN_HEADERS[4],
        size: columnWidths.nullable,
        cell: ({ row, getValue }) => (
          <CheckboxCell
            checked={getValue() === '是'}
            onChange={(v) => updateCellValue(row.index, 'nullable', v)}
          />
        ),
      }),
      columnHelper.accessor('defaultKind', {
        header: () => COLUMN_HEADERS[5],
        size: columnWidths.defaultKind,
        cell: ({ row, getValue }) => {
          const fieldType = toStringSafe(row.original.fieldType);
          const base = getCanonicalBaseType(fieldType);
          const options = getUiDefaultKindOptions(dbType, base);
          return (
            <SelectCell
              value={(getValue() as string) || '无'}
              options={options}
              onChange={(v) => updateCellValue(row.index, 'defaultKind', v)}
            />
          );
        },
      }),
      columnHelper.accessor('defaultValue', {
        header: () => COLUMN_HEADERS[6],
        size: columnWidths.defaultValue,
        cell: ({ row, getValue }) => {
          const kind = normalizeDefaultKind(
            row.original.defaultKind as UiDefaultKind,
          );
          const disabled = kind !== 'constant';
          return (
            <EditableCell
              value={(getValue() as string) || ''}
              onChange={(v) => updateCellValue(row.index, 'defaultValue', v)}
              onTabNavigate={(direction) =>
                handleTabNavigation(row.index, 5, direction)
              }
              disabled={disabled}
              placeholder={disabled ? '' : '默认值'}
            />
          );
        },
      }),
      columnHelper.accessor('onUpdate', {
        header: () => COLUMN_HEADERS[7],
        size: columnWidths.onUpdate,
        cell: ({ row, getValue }) => {
          const fieldType = toStringSafe(row.original.fieldType);
          const base = getCanonicalBaseType(fieldType);
          const defaultKind = normalizeDefaultKind(
            row.original.defaultKind as UiDefaultKind,
          );

          // Disable if defaultKind is uuid
          if (defaultKind === 'uuid') {
            return (
              <SelectCell
                value={(getValue() as string) || '无'}
                options={['无']}
                onChange={() => {}}
                disabled
              />
            );
          }

          const options = getUiOnUpdateOptions(dbType, base);
          if (options.length <= 1) {
            return (
              <SelectCell
                value={(getValue() as string) || '无'}
                options={['无']}
                onChange={() => {}}
                disabled
              />
            );
          }

          return (
            <SelectCell
              value={(getValue() as string) || '无'}
              options={options}
              onChange={(v) => updateCellValue(row.index, 'onUpdate', v)}
            />
          );
        },
      }),
      columnHelper.display({
        id: 'actions',
        size: columnWidths.actions,
        cell: ({ row }) => (
          <RowActions
            hasContent={
              !!(
                row.original.fieldName?.trim() ||
                row.original.fieldComment?.trim()
              )
            }
            fieldName={row.original.fieldName || ''}
            fieldComment={row.original.fieldComment || ''}
            onRemove={() => onRemoveRow(row.index, 1)}
          />
        ),
      }),
    ],
    [
      columnWidths,
      rowWarnings,
      dbType,
      updateCellValue,
      handleTabNavigation,
      onRemoveRow,
    ],
  );
}
