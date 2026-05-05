import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReactTable, getCoreRowModel, flexRender, type Row } from '@tanstack/react-table';
import { GripVertical } from 'lucide-react';
import { toStringSafe, isReservedKeyword } from '@/utils/helpers';
import { cn } from '@/lib/utils';
import type { EnumValueMeta, FieldRow } from '@ddlbuilder/shared-types';
import {
  buildDuplicateNameSet,
  useAppStore,
  useFieldStore,
  useIndexStore,
  usePartitionStore,
  useShardingStore,
  useForeignKeyStore,
} from '@/stores';
import { useFieldColumns } from './table/columns';
import { useFreezeColumns } from './table/useFreezeColumns';
import { useRowHighlight } from './table/useRowHighlight';
import { DataTableToolbar } from './table/DataTableToolbar';
import { useDataTableNavigation } from './table/useDataTableNavigation';
import { useDataTableClipboard } from './table/useDataTableClipboard';
import { useFieldRowMutations } from './table/useFieldRowMutations';
import { useFieldTypeChangeGuard } from './table/useFieldTypeChangeGuard';
import { DangerousChangeDialog } from './table/DangerousChangeDialog';
import { useSortableFieldRows } from './table/useSortableFieldRows';
import { useTranslation } from 'react-i18next';
import type { AICommentMode } from '@ddlbuilder/shared-types';

interface DataTableProps {
  toolbarLeft?: ReactNode;
  isHighlighted?: boolean;
  highlightedRowIndex?: number | null;
  onOpenStorageEstimator?: () => void;
  onOpenMockDataGenerator?: () => void;
  onOpenAISchemaPatch?: () => void;
  onGenerateComments?: (mode: AICommentMode, targetLocale?: 'zh-CN' | 'en-US') => void;
  isGeneratingComments?: boolean;
  onOpenAIIndexAdvisor?: () => void;
}

interface SortableDataRowProps {
  row: Row<FieldRow>;
  selectedCell: { row: number; col: number } | null;
  editingCell: { row: number; col: number } | null;
  setEditingCell: (cell: { row: number; col: number } | null) => void;
  handleCellActivate: (rowIndex: number, colIndex: number) => void;
  focusEditableCell: (rowIndex: number, editableColIndex: number) => void;
  focusFirstInteractiveInCell: (cellElement: HTMLTableCellElement | null) => void;
  freezeEnabled: boolean;
  effectiveFreezeColumns: number;
  getStickyLeft: (colIndex: number) => number;
  isRowHighlighted: boolean;
  dragFieldLabel: string;
}

const SortableDataRow = memo<SortableDataRowProps>(function SortableDataRow({
  row,
  selectedCell,
  setEditingCell,
  handleCellActivate,
  focusEditableCell,
  focusFirstInteractiveInCell,
  freezeEnabled,
  effectiveFreezeColumns,
  getStickyLeft,
  isRowHighlighted,
  dragFieldLabel,
}: SortableDataRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });

  const commitActiveInputOutsideCell = useCallback((cellElement: HTMLTableCellElement) => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLInputElement && !cellElement.contains(activeElement)) {
      activeElement.blur();
    }
  }, []);

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
        isRowHighlighted && 'bg-blue-500/10',
        isDragging && 'opacity-80',
      )}
    >
      {row.getVisibleCells().map((cell, colIndex) => {
        const isFrozen = freezeEnabled && colIndex < effectiveFreezeColumns;
        const isLastFrozen = freezeEnabled && colIndex === effectiveFreezeColumns - 1;
        const isSelected =
          selectedCell && selectedCell.row === row.index && selectedCell.col === colIndex - 1;
        const isOrderColumn = cell.column.id === 'order';

        return (
          <td
            key={cell.id}
            data-row-index={row.index}
            data-col-index={colIndex}
            className={cn(
              'h-9 px-1 bg-background text-xs transition-colors group-hover/row:bg-muted/30',
              isFrozen && 'relative sticky z-20 supports-[backdrop-filter]:backdrop-blur-[2px]',
              isLastFrozen &&
                'border-r border-primary/30 shadow-[8px_0_18px_-12px_hsl(var(--foreground)_/_0.22)] after:pointer-events-none after:absolute after:-right-3 after:top-0 after:h-full after:w-3 after:bg-gradient-to-r after:from-primary/20 after:to-transparent',
              isRowHighlighted && 'bg-blue-500/10',
              isSelected && 'ring-2 ring-primary ring-inset',
            )}
            style={{
              width: cell.column.getSize(),
              minWidth: cell.column.getSize(),
              left: isFrozen ? getStickyLeft(colIndex) : undefined,
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              if (event.target instanceof HTMLInputElement) return;
              const isTextEditableCell =
                colIndex === 1 ||
                colIndex === 2 ||
                colIndex === 3 ||
                (colIndex === 6 &&
                  event.currentTarget.querySelector('[data-editable-cell-trigger="true"]'));
              if (isTextEditableCell) {
                commitActiveInputOutsideCell(event.currentTarget);
                event.preventDefault();
                setEditingCell({ row: row.index, col: colIndex - 1 });
                handleCellActivate(row.index, colIndex);
                setTimeout(() => {
                  focusEditableCell(row.index, colIndex - 1);
                }, 0);
                return;
              }
              handleCellActivate(row.index, colIndex);
              focusFirstInteractiveInCell(event.currentTarget);
              setTimeout(() => {
                focusEditableCell(row.index, colIndex - 1);
              }, 0);
            }}
            onClick={(event) => {
              if (event.target instanceof HTMLInputElement) return;
              const isTextEditableCell =
                colIndex === 1 ||
                colIndex === 2 ||
                colIndex === 3 ||
                (colIndex === 6 &&
                  event.currentTarget.querySelector('[data-editable-cell-trigger="true"]'));
              if (isTextEditableCell) {
                event.preventDefault();
                setEditingCell({ row: row.index, col: colIndex - 1 });
                handleCellActivate(row.index, colIndex);
                setTimeout(() => {
                  focusEditableCell(row.index, colIndex - 1);
                }, 0);
                return;
              }
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
                  aria-label={dragFieldLabel}
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
});

SortableDataRow.displayName = 'SortableDataRow';

export const DataTable = memo<DataTableProps>(
  ({
    toolbarLeft,
    isHighlighted,
    highlightedRowIndex,
    onOpenStorageEstimator,
    onOpenMockDataGenerator,
    onOpenAISchemaPatch,
    onGenerateComments,
    isGeneratingComments,
    onOpenAIIndexAdvisor,
  }) => {
    const { t } = useTranslation();
    const rows = useFieldStore((state) => state.rows);
    const setRows = useFieldStore((state) => state.setRows);
    const onAddRows = useFieldStore((state) => state.handleAddRows);
    const onRemoveRow = useFieldStore((state) => state.handleRemoveRow);
    const dbType = useAppStore((state) => state.dbType);
    const addCount = useAppStore((state) => state.addCount);
    const onAddCountChange = useAppStore((state) => state.setAddCount);
    const freezeEnabled = useAppStore((state) => state.fieldTableFreezeEnabled);
    const onFreezeEnabledChange = useAppStore((state) => state.setFieldTableFreezeEnabled);
    const freezeColumns = useAppStore((state) => state.fieldTableFreezeColumns);
    const onFreezeColumnsChange = useAppStore((state) => state.setFieldTableFreezeColumns);
    const syncIndexFieldRename = useIndexStore((state) => state.syncFieldRename);
    const syncPartitionFieldRename = usePartitionStore((state) => state.syncFieldRename);
    const syncShardingFieldRename = useShardingStore((state) => state.syncFieldRename);
    const syncForeignKeyFieldRename = useForeignKeyStore((state) => state.syncFieldRename);

    const duplicateNameSet = useMemo(() => buildDuplicateNameSet(rows), [rows]);
    const tableRef = useRef<HTMLDivElement>(null);
    const dragFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dragFeedback, setDragFeedback] = useState<string | null>(null);
    const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);

    const [columnWidths] = useState<Record<string, number>>({
      order: 72,
      fieldName: 120,
      fieldComment: 150,
      fieldType: 120,
      nullable: 70,
      defaultKind: 110,
      defaultValue: 100,
      onUpdate: 100,
      actions: 50,
    });

    const editableColumnKeys = [
      'fieldName',
      'fieldComment',
      'fieldType',
      'nullable',
      'defaultKind',
      'defaultValue',
      'onUpdate',
    ] as const;

    const syncFieldRenameDependencies = useCallback(
      (oldFieldName: string, newFieldName: string) => {
        if (!oldFieldName || !newFieldName || oldFieldName === newFieldName) {
          return;
        }

        syncIndexFieldRename(oldFieldName, newFieldName, dbType);

        if (['mysql', 'mariadb', 'tidb'].includes(dbType)) {
          syncPartitionFieldRename(oldFieldName, newFieldName);
        }

        if (dbType === 'postgresql-citus') {
          syncShardingFieldRename(oldFieldName, newFieldName);
        }

        syncForeignKeyFieldRename(oldFieldName, newFieldName);
      },
      [
        dbType,
        syncIndexFieldRename,
        syncPartitionFieldRename,
        syncShardingFieldRename,
        syncForeignKeyFieldRename,
      ],
    );

    const { updateCellValue } = useFieldRowMutations({
      rows,
      setRows,
      onFieldRename: syncFieldRenameDependencies,
    });

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

    const rowWarnings = useMemo(() => {
      return rows.map((row) => {
        const warnings: string[] = [];
        const name = toStringSafe(row?.fieldName).trim();
        if (!name) return warnings;
        if (duplicateNameSet.has(name)) warnings.push(t('dataTable.duplicateName'));
        if (isReservedKeyword(dbType, name)) warnings.push(t('dataTable.reservedKeyword'));
        return warnings;
      });
    }, [rows, duplicateNameSet, dbType, t]);

    useEffect(
      () => () => {
        if (dragFeedbackTimerRef.current) {
          clearTimeout(dragFeedbackTimerRef.current);
        }
      },
      [],
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
      syncFieldRenameDependencies,
      clearSelection,
    });

    const columns = useFieldColumns({
      columnWidths,
      rowWarnings,
      editingCell,
      onEditingCellChange: setEditingCell,
      dbType,
      updateCellValue: guardedUpdateCellValue,
      updateEnumValues,
      handleTabNavigation,
      onRemoveRow,
    });

    const table = useReactTable({
      data: rows,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getRowId: (row) => String(row.order),
    });

    const handleDragResult = useCallback(
      ({ moved }: { moved: boolean }) => {
        if (!moved) return;
        setDragFeedback(t('dataTable.dragReordered'));
        if (dragFeedbackTimerRef.current) {
          clearTimeout(dragFeedbackTimerRef.current);
        }
        dragFeedbackTimerRef.current = setTimeout(() => {
          setDragFeedback(null);
        }, 1600);
      },
      [t],
    );

    const { sensors, rowIds, handleDragMove, handleDragEnd } = useSortableFieldRows({
      rows,
      setRows,
      onDragResult: handleDragResult,
    });

    const { getStickyLeft, frozenAreaWidth, effectiveFreezeColumns } = useFreezeColumns(
      columnWidths,
      freezeEnabled,
      freezeColumns,
    );

    useRowHighlight(tableRef, highlightedRowIndex);

    const safeAddCount = Number.isFinite(addCount) && addCount > 0 ? Math.floor(addCount) : 1;

    const handleAddRowsClick = useCallback(() => {
      onAddRows(safeAddCount);
    }, [onAddRows, safeAddCount]);

    return (
      <div
        className={cn(
          'relative min-h-[420px] flex-1 rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5',
          isHighlighted && 'animate-field-highlight',
        )}
        onPaste={handlePaste}
      >
        {isHighlighted && (
          <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-blue-500 animate-pulse z-10" />
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-primary/30 to-transparent" />

        <DataTableToolbar
          toolbarLeft={toolbarLeft}
          onOpenStorageEstimator={onOpenStorageEstimator}
          onOpenMockDataGenerator={onOpenMockDataGenerator}
          onOpenAISchemaPatch={onOpenAISchemaPatch}
          onGenerateComments={onGenerateComments}
          isGeneratingComments={isGeneratingComments}
          onOpenAIIndexAdvisor={onOpenAIIndexAdvisor}
          freezeEnabled={freezeEnabled}
          onFreezeEnabledChange={onFreezeEnabledChange}
          effectiveFreezeColumns={effectiveFreezeColumns}
          onFreezeColumnsChange={onFreezeColumnsChange}
          safeAddCount={safeAddCount}
          onAddCountChange={onAddCountChange}
          onAddRowsClick={handleAddRowsClick}
        />
        {dragFeedback && (
          <output
            aria-live="polite"
            className="absolute right-4 top-3 z-20 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary"
            data-testid="field-drag-feedback"
          >
            {dragFeedback}
          </output>
        )}

        <section
          ref={tableRef}
          aria-label={t('dataTable.ariaLabel')}
          className="relative overflow-x-auto p-4"
        >
          <p id="field-config-table-description" className="sr-only">
            {t('dataTable.ariaDescription')}
          </p>
          {freezeEnabled && frozenAreaWidth > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-4 left-4 top-4 z-10 rounded-l-md bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent transition-[width] duration-200"
              style={{ width: frozenAreaWidth }}
            />
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <table
                className="border-separate border-spacing-0 table-fixed text-xs"
                style={{ minWidth: Object.values(columnWidths).reduce((a, b) => a + b, 0) }}
                data-testid="data-table"
                aria-label={t('dataTable.ariaLabel')}
                aria-describedby="field-config-table-description"
              >
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-border/50">
                      {headerGroup.headers.map((header, colIndex) => {
                        const isFrozen = freezeEnabled && colIndex < effectiveFreezeColumns;
                        const isLastFrozen =
                          freezeEnabled && colIndex === effectiveFreezeColumns - 1;
                        return (
                          <th
                            key={header.id}
                            className={cn(
                              'h-9 px-2 text-left text-xs font-medium text-muted-foreground',
                              isFrozen
                                ? 'relative sticky z-30 bg-muted/30 supports-[backdrop-filter]:backdrop-blur-[2px]'
                                : 'bg-muted/30',
                              isLastFrozen &&
                                'border-r border-primary/30 shadow-[8px_0_18px_-12px_hsl(var(--foreground)_/_0.22)] after:pointer-events-none after:absolute after:-right-3 after:top-0 after:h-full after:w-3 after:bg-gradient-to-r after:from-primary/20 after:to-transparent',
                            )}
                            style={{
                              width: header.getSize(),
                              minWidth: header.getSize(),
                              left: isFrozen ? getStickyLeft(colIndex) : undefined,
                            }}
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <SortableDataRow
                      key={row.id}
                      row={row}
                      selectedCell={selectedCell}
                      editingCell={editingCell}
                      setEditingCell={setEditingCell}
                      handleCellActivate={handleCellActivate}
                      focusEditableCell={focusEditableCell}
                      focusFirstInteractiveInCell={focusFirstInteractiveInCell}
                      freezeEnabled={freezeEnabled}
                      effectiveFreezeColumns={effectiveFreezeColumns}
                      getStickyLeft={getStickyLeft}
                      isRowHighlighted={highlightedRowIndex === row.index}
                      dragFieldLabel={t('dataTable.dragField')}
                    />
                  ))}
                </tbody>
              </table>
            </SortableContext>
          </DndContext>
        </section>

        <DangerousChangeDialog
          open={!!pendingChange}
          risk={pendingChange?.risk ?? null}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </div>
    );
  },
);

DataTable.displayName = 'DataTable';
