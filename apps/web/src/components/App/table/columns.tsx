import { useMemo, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { CheckboxCell } from './CheckboxCell';
import { EditableCell } from './EditableCell';
import { OrderCell } from './OrderCell';
import { SelectCell } from './SelectCell';
import type { FieldTableColumnDef, FieldTableFeatures, FieldTableRow } from './tableFeatures';
import { RowActions } from './RowActions';
import { EnumSetCell } from './EnumSetCell';
import { LogicalEnumCell } from './LogicalEnumCell';
import type { DatabaseType, EnumValueMeta, FieldRow } from '@ddlbuilder/shared-types';
import { toStringSafe, getUiDefaultKindOptions, getUiOnUpdateOptions } from '@/utils/helpers';
import { getCanonicalBaseType } from '@ddlbuilder/ddl-core';
import { getDefaultKindLabel, getOnUpdateLabel } from '@/i18n/fieldEnums';
import { useTranslation } from 'react-i18next';

const columnHelper = createColumnHelper<FieldTableFeatures, FieldRow>();

const LOGICAL_ENUM_BASES = new Set(['tinyint', 'smallint', 'int', 'bigint', 'char', 'varchar']);
type EditingCell = { row: number; col: number };

interface UseFieldColumnsParams {
  mode?: 'table' | 'template';
  columnWidths: Record<string, number>;
  rowWarnings: string[][];
  editingCell?: EditingCell | null;
  onEditingCellChange?: Dispatch<SetStateAction<EditingCell | null>>;
  dbType: DatabaseType;
  updateCellValue: (rowIndex: number, columnId: string, value: string | boolean) => void;
  updateEnumValues?: (rowIndex: number, fieldType: string, enumMeta: EnumValueMeta[]) => void;
  handleTabNavigation: (rowIndex: number, editableColIndex: number, direction: 1 | -1) => void;
  onRemoveRow: (rowIndex: number, count: number) => void;
  renderOrderCell?: (params: { row: FieldTableRow; warnings: string[] }) => ReactNode;
}

export function useFieldColumns(params: UseFieldColumnsParams): FieldTableColumnDef[] {
  const { t } = useTranslation();
  const {
    mode = 'table',
    columnWidths,
    rowWarnings,
    editingCell,
    onEditingCellChange,
    dbType,
    updateCellValue,
    updateEnumValues,
    handleTabNavigation,
    onRemoveRow,
    renderOrderCell,
  } = params;

  return useMemo<FieldTableColumnDef[]>(
    () => [
      columnHelper.display({
        id: 'order',
        header: () => t('dataTable.headers.order'),
        size: columnWidths.order,
        cell: ({ row }) =>
          renderOrderCell ? (
            renderOrderCell({
              row,
              warnings: rowWarnings[row.index] || [],
            })
          ) : (
            <OrderCell order={row.index + 1} warnings={rowWarnings[row.index] || []} />
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
            isEditing={editingCell?.row === row.index && editingCell.col === 0}
            onEditingChange={(isEditing) => {
              onEditingCellChange?.((prev) =>
                isEditing
                  ? { row: row.index, col: 0 }
                  : prev?.row === row.index && prev.col === 0
                    ? null
                    : prev,
              );
            }}
            onEditingEnd={() => {
              onEditingCellChange?.((prev) =>
                prev?.row === row.index && prev.col === 0 ? null : prev,
              );
            }}
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
            isEditing={editingCell?.row === row.index && editingCell.col === 1}
            onEditingChange={(isEditing) => {
              onEditingCellChange?.((prev) =>
                isEditing
                  ? { row: row.index, col: 1 }
                  : prev?.row === row.index && prev.col === 1
                    ? null
                    : prev,
              );
            }}
            onEditingEnd={() => {
              onEditingCellChange?.((prev) =>
                prev?.row === row.index && prev.col === 1 ? null : prev,
              );
            }}
            placeholder={t('dataTable.placeholder.fieldComment')}
          />
        ),
      }),
      columnHelper.accessor('fieldType', {
        header: () => t('dataTable.headers.fieldType'),
        size: columnWidths.fieldType,
        cell: ({ row, getValue }) => {
          const fieldTypeValue = getValue() as string;
          const isEditingFieldType = editingCell?.row === row.index && editingCell.col === 2;
          if (isEditingFieldType) {
            return (
              <EditableCell
                value={fieldTypeValue}
                onChange={(v) => updateCellValue(row.index, 'fieldType', v)}
                onTabNavigate={(direction) => handleTabNavigation(row.index, 2, direction)}
                isEditing={isEditingFieldType}
                onEditingChange={(isEditing) => {
                  onEditingCellChange?.((prev) =>
                    isEditing
                      ? { row: row.index, col: 2 }
                      : prev?.row === row.index && prev.col === 2
                        ? null
                        : prev,
                  );
                }}
                onEditingEnd={() => {
                  onEditingCellChange?.((prev) =>
                    prev?.row === row.index && prev.col === 2 ? null : prev,
                  );
                }}
                placeholder={t('dataTable.placeholder.fieldType')}
              />
            );
          }
          const canonical = getCanonicalBaseType(fieldTypeValue);
          if (canonical === 'enum' || canonical === 'set') {
            return (
              <EnumSetCell
                fieldType={fieldTypeValue}
                enumMeta={row.original.enumMeta}
                onSave={(ft, meta) => {
                  if (updateEnumValues) {
                    updateEnumValues(row.index, ft, meta);
                  } else {
                    updateCellValue(row.index, 'fieldType', ft);
                  }
                }}
                onTabNavigate={(direction) => handleTabNavigation(row.index, 2, direction)}
              />
            );
          }
          if (LOGICAL_ENUM_BASES.has(canonical)) {
            return (
              <LogicalEnumCell
                fieldType={fieldTypeValue}
                enumMeta={row.original.enumMeta}
                onTypeChange={(v) => updateCellValue(row.index, 'fieldType', v)}
                onEnumSave={(ft, meta) => updateEnumValues?.(row.index, ft, meta)}
                onTabNavigate={(direction) => handleTabNavigation(row.index, 2, direction)}
              />
            );
          }
          return (
            <EditableCell
              value={fieldTypeValue}
              onChange={(v) => updateCellValue(row.index, 'fieldType', v)}
              onTabNavigate={(direction) => handleTabNavigation(row.index, 2, direction)}
              isEditing={editingCell?.row === row.index && editingCell.col === 2}
              onEditingChange={(isEditing) => {
                onEditingCellChange?.((prev) =>
                  isEditing
                    ? { row: row.index, col: 2 }
                    : prev?.row === row.index && prev.col === 2
                      ? null
                      : prev,
                );
              }}
              onEditingEnd={() => {
                onEditingCellChange?.((prev) =>
                  prev?.row === row.index && prev.col === 2 ? null : prev,
                );
              }}
              placeholder={t('dataTable.placeholder.fieldType')}
            />
          );
        },
      }),
      columnHelper.accessor('nullable', {
        header: () => t('dataTable.headers.nullable'),
        size: columnWidths.nullable,
        cell: ({ row, getValue }) => (
          <CheckboxCell
            checked={getValue()}
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
              value={getValue() ?? 'none'}
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
          const disabled =
            row.original.defaultKind !== 'constant' && row.original.defaultKind !== 'expression';
          return (
            <EditableCell
              value={(getValue() as string) || ''}
              onChange={(v) => updateCellValue(row.index, 'defaultValue', v)}
              onTabNavigate={(direction) => handleTabNavigation(row.index, 5, direction)}
              isEditing={editingCell?.row === row.index && editingCell.col === 5}
              onEditingChange={(isEditing) => {
                onEditingCellChange?.((prev) =>
                  isEditing
                    ? { row: row.index, col: 5 }
                    : prev?.row === row.index && prev.col === 5
                      ? null
                      : prev,
                );
              }}
              onEditingEnd={() => {
                onEditingCellChange?.((prev) =>
                  prev?.row === row.index && prev.col === 5 ? null : prev,
                );
              }}
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
          const options = getUiOnUpdateOptions(dbType, base);

          // uuid 默认值与 ON UPDATE 互斥
          if (row.original.defaultKind === 'uuid' || options.length <= 1) {
            return (
              <SelectCell
                value={getValue() ?? 'none'}
                options={[{ value: 'none', label: getOnUpdateLabel('none', t) }]}
                onChange={() => {}}
                disabled
              />
            );
          }

          return (
            <SelectCell
              value={getValue() ?? 'none'}
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
      editingCell,
      onEditingCellChange,
      dbType,
      updateCellValue,
      updateEnumValues,
      handleTabNavigation,
      onRemoveRow,
      renderOrderCell,
    ],
  );
}
