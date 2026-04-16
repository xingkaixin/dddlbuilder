import { useMemo, type ReactNode } from 'react';
import { createColumnHelper, type ColumnDef, type Row } from '@tanstack/react-table';
import { EditableCell, SelectCell, CheckboxCell, OrderCell } from './index';
import { RowActions } from './RowActions';
import type { DatabaseType, FieldRow, UiDefaultKind } from '@ddlbuilder/shared-types';
import {
  toStringSafe,
  normalizeDefaultKind,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
} from '@/utils/helpers';
import { getCanonicalBaseType } from '@/utils/databaseTypeMapping';
import { getDefaultKindLabel, getOnUpdateLabel } from '@/i18n/fieldEnums';
import { useTranslation } from 'react-i18next';

const columnHelper = createColumnHelper<FieldRow>();

interface UseFieldColumnsParams {
  mode?: 'table' | 'template';
  columnWidths: Record<string, number>;
  rowWarnings: string[][];
  dbType: DatabaseType;
  updateCellValue: (rowIndex: number, columnId: string, value: string | boolean) => void;
  handleTabNavigation: (rowIndex: number, editableColIndex: number, direction: 1 | -1) => void;
  onRemoveRow: (rowIndex: number, count: number) => void;
  renderOrderCell?: (params: { row: Row<FieldRow>; warnings: string[] }) => ReactNode;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useFieldColumns(params: UseFieldColumnsParams): ColumnDef<FieldRow, any>[] {
  const { t } = useTranslation();
  const {
    mode = 'table',
    columnWidths,
    rowWarnings,
    dbType,
    updateCellValue,
    handleTabNavigation,
    onRemoveRow,
    renderOrderCell,
  } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return useMemo<ColumnDef<FieldRow, any>[]>(
    () => [
      columnHelper.accessor('order', {
        header: () => t('dataTable.headers.order'),
        size: columnWidths.order,
        cell: ({ row }) =>
          renderOrderCell ? (
            renderOrderCell({
              row,
              warnings: rowWarnings[row.index] || [],
            })
          ) : (
            <OrderCell order={row.original.order} warnings={rowWarnings[row.index] || []} />
          ),
      }),
      columnHelper.accessor('fieldName', {
        header: () => t('dataTable.headers.fieldName'),
        size: columnWidths.fieldName,
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldName', v)}
            onTabNavigate={(direction) => handleTabNavigation(row.index, 0, direction)}
            placeholder={t('dataTable.placeholder.fieldName')}
          />
        ),
      }),
      columnHelper.accessor('fieldComment', {
        header: () => t('dataTable.headers.fieldComment'),
        size: columnWidths.fieldComment,
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldComment', v)}
            onTabNavigate={(direction) => handleTabNavigation(row.index, 1, direction)}
            placeholder={t('dataTable.placeholder.fieldComment')}
          />
        ),
      }),
      columnHelper.accessor('fieldType', {
        header: () => t('dataTable.headers.fieldType'),
        size: columnWidths.fieldType,
        cell: ({ row, getValue }) => (
          <EditableCell
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldType', v)}
            onTabNavigate={(direction) => handleTabNavigation(row.index, 2, direction)}
            placeholder={t('dataTable.placeholder.fieldType')}
          />
        ),
      }),
      columnHelper.accessor('nullable', {
        header: () => t('dataTable.headers.nullable'),
        size: columnWidths.nullable,
        cell: ({ row, getValue }) => (
          <CheckboxCell
            checked={getValue() === '是'}
            onChange={(v) => updateCellValue(row.index, 'nullable', v)}
          />
        ),
      }),
      columnHelper.accessor('defaultKind', {
        header: () => t('dataTable.headers.defaultKind'),
        size: columnWidths.defaultKind,
        cell: ({ row, getValue }) => {
          const fieldType = toStringSafe(row.original.fieldType);
          const base = getCanonicalBaseType(fieldType);
          const options = getUiDefaultKindOptions(dbType, base);
          return (
            <SelectCell
              value={(getValue() as string) || '无'}
              options={options.map((option) => ({
                value: option,
                label: getDefaultKindLabel(option, t),
              }))}
              onChange={(v) => updateCellValue(row.index, 'defaultKind', v)}
            />
          );
        },
      }),
      columnHelper.accessor('defaultValue', {
        header: () => t('dataTable.headers.defaultValue'),
        size: columnWidths.defaultValue,
        cell: ({ row, getValue }) => {
          const kind = normalizeDefaultKind(row.original.defaultKind as UiDefaultKind);
          const disabled = kind !== 'constant';
          return (
            <EditableCell
              value={(getValue() as string) || ''}
              onChange={(v) => updateCellValue(row.index, 'defaultValue', v)}
              onTabNavigate={(direction) => handleTabNavigation(row.index, 5, direction)}
              disabled={disabled}
              placeholder={disabled ? '' : t('dataTable.placeholder.defaultValue')}
            />
          );
        },
      }),
      columnHelper.accessor('onUpdate', {
        header: () => t('dataTable.headers.onUpdate'),
        size: columnWidths.onUpdate,
        cell: ({ row, getValue }) => {
          const fieldType = toStringSafe(row.original.fieldType);
          const base = getCanonicalBaseType(fieldType);
          const defaultKind = normalizeDefaultKind(row.original.defaultKind as UiDefaultKind);

          // Disable if defaultKind is uuid
          if (defaultKind === 'uuid') {
            return (
              <SelectCell
                value={(getValue() as string) || '无'}
                options={[{ value: '无', label: getOnUpdateLabel('无', t) }]}
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
                options={[{ value: '无', label: getOnUpdateLabel('无', t) }]}
                onChange={() => {}}
                disabled
              />
            );
          }

          return (
            <SelectCell
              value={(getValue() as string) || '无'}
              options={options.map((option) => ({
                value: option,
                label: getOnUpdateLabel(option, t),
              }))}
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
              mode === 'template'
                ? !!(
                    row.original.fieldName?.trim() ||
                    row.original.fieldType?.trim() ||
                    row.original.fieldComment?.trim()
                  )
                : !!(row.original.fieldName?.trim() || row.original.fieldComment?.trim())
            }
            fieldName={row.original.fieldName || ''}
            fieldComment={row.original.fieldComment || ''}
            onRemove={() => onRemoveRow(row.index, 1)}
          />
        ),
      }),
    ],
    [
      t,
      mode,
      columnWidths,
      rowWarnings,
      dbType,
      updateCellValue,
      handleTabNavigation,
      onRemoveRow,
      renderOrderCell,
    ],
  );
}
