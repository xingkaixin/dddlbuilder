import { memo, useCallback, useMemo, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReactTable, getCoreRowModel, flexRender, type Row } from '@tanstack/react-table';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DatabaseType, EnumValueMeta, FieldRow } from '@ddlbuilder/shared-types';
import { buildDuplicateNameSet } from '@/stores';
import { isReservedKeyword, createEmptyRow, ensureOrder, toStringSafe } from '@/utils/helpers';
import { useFieldColumns } from './table/columns';
import { useDataTableNavigation } from './table/useDataTableNavigation';
import { useDataTableClipboard } from './table/useDataTableClipboard';
import { useFieldRowMutations } from './table/useFieldRowMutations';
import { useFieldTypeChangeGuard } from './table/useFieldTypeChangeGuard';
import { DangerousChangeDialog } from './table/DangerousChangeDialog';
import { useSortableFieldRows } from './table/useSortableFieldRows';
import { useTranslation } from 'react-i18next';

interface TemplateFieldTableProps {
  rows: FieldRow[];
  setRows: Dispatch<SetStateAction<FieldRow[]>>;
  dbType: DatabaseType;
}

interface SortableTemplateRowProps {
  row: Row<FieldRow>;
  selectedCell: { row: number; col: number } | null;
  handleCellActivate: (rowIndex: number, colIndex: number) => void;
  focusEditableCell: (rowIndex: number, editableColIndex: number) => void;
  focusFirstInteractiveInCell: (cellElement: HTMLTableCellElement | null) => void;
  t: (key: string) => string;
}

const SortableTemplateRow = memo<SortableTemplateRowProps>(
  ({
    row,
    selectedCell,
    handleCellActivate,
    focusEditableCell,
    focusFirstInteractiveInCell,
    t,
  }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: row.id,
    });

    return (
      <tr
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        data-row-index={row.index}
        className={cn(
          'group/row border-b border-border/30 transition-colors hover:bg-muted/30',
          isDragging && 'opacity-80',
        )}
      >
        {row.getVisibleCells().map((cell, colIndex) => {
          const isSelected =
            selectedCell && selectedCell.row === row.index && selectedCell.col === colIndex - 1;
          const isOrderColumn = cell.column.id === 'order';

          return (
            <td
              key={cell.id}
              data-row-index={row.index}
              data-col-index={colIndex}
              className={cn(
                'h-10 px-1 bg-background transition-colors group-hover/row:bg-muted/30',
                isSelected && 'ring-2 ring-primary ring-inset',
              )}
              style={{
                width: cell.column.getSize(),
                minWidth: cell.column.getSize(),
              }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                handleCellActivate(row.index, colIndex);
                focusFirstInteractiveInCell(event.currentTarget);
                setTimeout(() => {
                  focusEditableCell(row.index, colIndex - 1);
                }, 0);
              }}
              onClick={(event) => {
                handleCellActivate(row.index, colIndex);
                focusFirstInteractiveInCell(event.currentTarget);
              }}
              onFocusCapture={() => handleCellActivate(row.index, colIndex)}
            >
              {isOrderColumn ? (
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={t('templateManager.editor.dragField')}
                    {...attributes}
                    {...listeners}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ) : (
                flexRender(cell.column.columnDef.cell, cell.getContext())
              )}
            </td>
          );
        })}
      </tr>
    );
  },
);

SortableTemplateRow.displayName = 'SortableTemplateRow';

export const TemplateFieldTable = memo<TemplateFieldTableProps>(({ rows, setRows, dbType }) => {
  const { t } = useTranslation();
  const tableRef = useRef<HTMLDivElement>(null);

  const columnWidths = useMemo(
    () => ({
      order: 72,
      fieldName: 120,
      fieldComment: 150,
      fieldType: 120,
      nullable: 70,
      defaultKind: 110,
      defaultValue: 100,
      onUpdate: 100,
      actions: 56,
    }),
    [],
  );

  const editableColumnKeys = [
    'fieldName',
    'fieldComment',
    'fieldType',
    'nullable',
    'defaultKind',
    'defaultValue',
    'onUpdate',
  ] as const;

  const duplicateNameSet = useMemo(() => buildDuplicateNameSet(rows), [rows]);

  const rowWarnings = useMemo(() => {
    return rows.map((row) => {
      const warnings: string[] = [];
      const name = toStringSafe(row?.fieldName).trim();
      if (!name) return warnings;
      if (duplicateNameSet.has(name)) {
        warnings.push(t('dataTable.duplicateName'));
      }
      if (isReservedKeyword(dbType, name)) {
        warnings.push(t('dataTable.reservedKeyword'));
      }
      return warnings;
    });
  }, [rows, duplicateNameSet, dbType, t]);

  const { updateCellValue } = useFieldRowMutations({ rows, setRows });

  const { guardedUpdateCellValue, pendingChange, handleConfirm, handleCancel } =
    useFieldTypeChangeGuard(rows, updateCellValue);

  const updateEnumValues = useCallback(
    (rowIndex: number, fieldType: string, enumMeta: EnumValueMeta[]) => {
      setRows((prev) => {
        const next = [...prev];
        next[rowIndex] = { ...next[rowIndex], fieldType, enumMeta };
        return next;
      });
    },
    [setRows],
  );

  const {
    selectedCell,
    setSelectedCell,
    focusEditableCell,
    focusFirstInteractiveInCell,
    handleCellActivate,
    handleTabNavigation,
  } = useDataTableNavigation({
    rowsLength: rows.length,
    editableColumnCount: editableColumnKeys.length,
    tableRef,
  });

  const clearSelection = useCallback(() => {
    setSelectedCell(null);
  }, [setSelectedCell]);

  const { handlePaste } = useDataTableClipboard({
    rows,
    setRows,
    selectedCell,
    editableColumnKeys,
    syncFieldRenameDependencies: () => {},
    clearSelection,
  });

  const handleRemoveRow = useCallback(
    (index: number, amount: number) => {
      setRows((prev) => {
        const next = prev.slice();
        next.splice(index, amount);
        if (next.length === 0) {
          next.push(createEmptyRow(0));
        }
        return ensureOrder(next);
      });
    },
    [setRows],
  );

  const columns = useFieldColumns({
    mode: 'template',
    columnWidths,
    rowWarnings,
    dbType,
    updateCellValue: guardedUpdateCellValue,
    updateEnumValues,
    handleTabNavigation,
    onRemoveRow: handleRemoveRow,
  });

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.order),
  });

  const { sensors, rowIds, handleDragEnd } = useSortableFieldRows({
    rows,
    setRows,
  });

  return (
    <div className="rounded-md border bg-card/60">
      <div ref={tableRef} className="max-h-[360px] overflow-auto p-2" onPaste={handlePaste}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            <table
              className="w-full border-collapse text-sm"
              data-testid="template-field-table"
              aria-label={t('templateManager.editor.fieldList')}
            >
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="border-b border-border/50">
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        className="h-10 px-2 text-left text-sm font-medium text-muted-foreground bg-muted/30"
                        style={{
                          width: header.getSize(),
                          minWidth: header.getSize(),
                        }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <SortableTemplateRow
                    key={row.id}
                    row={row}
                    selectedCell={selectedCell}
                    handleCellActivate={handleCellActivate}
                    focusEditableCell={focusEditableCell}
                    focusFirstInteractiveInCell={focusFirstInteractiveInCell}
                    t={t}
                  />
                ))}
              </tbody>
            </table>
          </SortableContext>
        </DndContext>
      </div>
      <DangerousChangeDialog
        open={!!pendingChange}
        risk={pendingChange?.risk ?? null}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
});

TemplateFieldTable.displayName = 'TemplateFieldTable';
