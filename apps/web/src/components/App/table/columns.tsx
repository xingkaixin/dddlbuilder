import { createContext, use, useMemo, type Dispatch, type SetStateAction } from 'react';
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
import type { EditableFieldKey, UpdateEditableField } from './useFieldRowMutations';

const columnHelper = createColumnHelper<FieldTableFeatures, FieldRow>();

const LOGICAL_ENUM_BASES = new Set(['tinyint', 'smallint', 'int', 'bigint', 'char', 'varchar']);
const EDITABLE_FIELD_KEYS = [
  'fieldName',
  'fieldComment',
  'fieldType',
  'nullable',
  'defaultKind',
  'defaultValue',
  'onUpdate',
] as const;
const NO_WARNINGS: string[] = [];

type EditingCell = { row: number; col: string };

type EditingCellChange = Dispatch<SetStateAction<EditingCell | null>>;

type TabNavigation = (rowIndex: number, columnId: string, direction: 1 | -1) => void;

type UpdateEnumValues = (rowIndex: number, fieldType: string, enumMeta: EnumValueMeta[]) => void;

interface FieldRowState {
  editingColumn: string | null;
  warnings: string[];
}

// 行级编辑态和告警由行组件提供，列定义因此不随它们变化，未改动的行可以跳过重渲染。
export const FieldRowStateContext = createContext<FieldRowState>({
  editingColumn: null,
  warnings: NO_WARNINGS,
});

function OrderColumnCell({ order }: { order: number }) {
  const { warnings } = use(FieldRowStateContext);

  return <OrderCell order={order} warnings={warnings} />;
}

interface TextColumnCellProps {
  rowIndex: number;
  columnId: string;
  value: string;
  onChange: (value: string) => void;
  handleTabNavigation: TabNavigation;
  onEditingCellChange?: EditingCellChange;
  disabled?: boolean;
  placeholder?: string;
}

function TextColumnCell({
  rowIndex,
  columnId,
  value,
  onChange,
  handleTabNavigation,
  onEditingCellChange,
  disabled,
  placeholder,
}: TextColumnCellProps) {
  const { editingColumn } = use(FieldRowStateContext);

  return (
    <EditableCell
      value={value}
      onChange={onChange}
      onTabNavigate={(direction) => handleTabNavigation(rowIndex, columnId, direction)}
      isEditing={editingColumn === columnId}
      onEditingChange={(isEditing) => {
        onEditingCellChange?.((prev) =>
          isEditing
            ? { row: rowIndex, col: columnId }
            : prev?.row === rowIndex && prev.col === columnId
              ? null
              : prev,
        );
      }}
      onEditingEnd={() => {
        onEditingCellChange?.((prev) =>
          prev?.row === rowIndex && prev.col === columnId ? null : prev,
        );
      }}
      disabled={disabled}
      placeholder={placeholder}
    />
  );
}

interface FieldTypeColumnCellProps {
  row: FieldTableRow;
  value: string;
  placeholder: string;
  updateCellValue: UpdateEditableField;
  updateEnumValues?: UpdateEnumValues;
  handleTabNavigation: TabNavigation;
  onEditingCellChange?: EditingCellChange;
}

function FieldTypeColumnCell({
  row,
  value,
  placeholder,
  updateCellValue,
  updateEnumValues,
  handleTabNavigation,
  onEditingCellChange,
}: FieldTypeColumnCellProps) {
  const { editingColumn } = use(FieldRowStateContext);
  const canonical = getCanonicalBaseType(value);

  if (editingColumn !== 'fieldType' && (canonical === 'enum' || canonical === 'set')) {
    return (
      <EnumSetCell
        fieldType={value}
        enumMeta={row.original.enumMeta}
        onSave={(ft, meta) => {
          if (updateEnumValues) {
            updateEnumValues(row.index, ft, meta);
          } else {
            updateCellValue(row.index, 'fieldType', ft);
          }
        }}
        onTabNavigate={(direction) => handleTabNavigation(row.index, 'fieldType', direction)}
      />
    );
  }

  if (editingColumn !== 'fieldType' && LOGICAL_ENUM_BASES.has(canonical)) {
    return (
      <LogicalEnumCell
        fieldType={value}
        enumMeta={row.original.enumMeta}
        onTypeChange={(v) => updateCellValue(row.index, 'fieldType', v)}
        onEnumSave={(ft, meta) => updateEnumValues?.(row.index, ft, meta)}
        onTabNavigate={(direction) => handleTabNavigation(row.index, 'fieldType', direction)}
      />
    );
  }

  return (
    <TextColumnCell
      rowIndex={row.index}
      columnId="fieldType"
      value={value}
      onChange={(v) => updateCellValue(row.index, 'fieldType', v)}
      handleTabNavigation={handleTabNavigation}
      onEditingCellChange={onEditingCellChange}
      placeholder={placeholder}
    />
  );
}

interface UseFieldColumnsParams {
  mode?: 'table' | 'template';
  columnWidths: Record<string, number>;
  onEditingCellChange?: EditingCellChange;
  dbType: DatabaseType;
  updateCellValue: UpdateEditableField;
  updateEnumValues?: UpdateEnumValues;
  handleTabNavigation: TabNavigation;
  onRemoveRow: (rowIndex: number, count: number) => void;
}

export function useFieldColumns(params: UseFieldColumnsParams): FieldTableColumnDef[] {
  const { t } = useTranslation();

  const {
    mode = 'table',
    columnWidths,
    onEditingCellChange,
    dbType,
    updateCellValue,
    updateEnumValues,
    handleTabNavigation,
    onRemoveRow,
  } = params;

  return useMemo<FieldTableColumnDef[]>(
    () => [
      columnHelper.display({
        id: 'order',
        header: () => t('dataTable.headers.order'),
        size: columnWidths.order,
        cell: ({ row }) => <OrderColumnCell order={row.index + 1} />,
      }),
      columnHelper.accessor('fieldName', {
        meta: { editable: 'text' },
        header: () => t('dataTable.headers.fieldName'),
        size: columnWidths.fieldName,
        cell: ({ row, getValue }) => (
          <TextColumnCell
            rowIndex={row.index}
            columnId="fieldName"
            // SAFETY: the accessor column is declared for FieldRow and therefore yields a string here.
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldName', v)}
            handleTabNavigation={handleTabNavigation}
            onEditingCellChange={onEditingCellChange}
            placeholder={t('dataTable.placeholder.fieldName')}
          />
        ),
      }),
      columnHelper.accessor('fieldComment', {
        meta: { editable: 'text' },
        header: () => t('dataTable.headers.fieldComment'),
        size: columnWidths.fieldComment,
        cell: ({ row, getValue }) => (
          <TextColumnCell
            rowIndex={row.index}
            columnId="fieldComment"
            // SAFETY: the accessor column is declared for FieldRow and therefore yields a string here.
            value={getValue() as string}
            onChange={(v) => updateCellValue(row.index, 'fieldComment', v)}
            handleTabNavigation={handleTabNavigation}
            onEditingCellChange={onEditingCellChange}
            placeholder={t('dataTable.placeholder.fieldComment')}
          />
        ),
      }),
      columnHelper.accessor('fieldType', {
        meta: { editable: 'text' },
        header: () => t('dataTable.headers.fieldType'),
        size: columnWidths.fieldType,
        cell: ({ row, getValue }) => (
          <FieldTypeColumnCell
            row={row}
            // SAFETY: the accessor column is declared for FieldRow and therefore yields a string here.
            value={getValue() as string}
            placeholder={t('dataTable.placeholder.fieldType')}
            updateCellValue={updateCellValue}
            updateEnumValues={updateEnumValues}
            handleTabNavigation={handleTabNavigation}
            onEditingCellChange={onEditingCellChange}
          />
        ),
      }),
      columnHelper.accessor('nullable', {
        meta: { editable: 'control' },
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
        meta: { editable: 'control' },
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
        meta: { editable: 'text' },
        header: () => t('dataTable.headers.defaultValue'),
        size: columnWidths.defaultValue,
        cell: ({ row, getValue }) => {
          const disabled =
            row.original.defaultKind !== 'constant' && row.original.defaultKind !== 'expression';

          return (
            <TextColumnCell
              rowIndex={row.index}
              columnId="defaultValue"
              // SAFETY: the accessor column is declared for FieldRow and therefore yields a string here.
              value={(getValue() as string) || ''}
              onChange={(v) => updateCellValue(row.index, 'defaultValue', v)}
              handleTabNavigation={handleTabNavigation}
              onEditingCellChange={onEditingCellChange}
              disabled={disabled}
              placeholder={disabled ? '' : t('dataTable.placeholder.defaultValue')}
            />
          );
        },
      }),
      columnHelper.accessor('onUpdate', {
        meta: { editable: 'control' },
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
      onEditingCellChange,
      dbType,
      updateCellValue,
      updateEnumValues,
      handleTabNavigation,
      onRemoveRow,
    ],
  );
}

export function getEditableColumnKeys(columns: FieldTableColumnDef[]) {
  return columns.flatMap((column): EditableFieldKey[] => {
    if (!column.meta?.editable || !('accessorKey' in column)) return [];
    const key = EDITABLE_FIELD_KEYS.find((candidate) => candidate === column.accessorKey);

    return key ? [key] : [];
  });
}
