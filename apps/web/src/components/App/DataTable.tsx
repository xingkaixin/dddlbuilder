import { memo, useCallback, useMemo, useReducer, useRef } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTable, flexRender } from '@tanstack/react-table';
import { DragDropVerticalIcon } from '@/components/icons';
import { toStringSafe, isReservedKeyword } from '@/utils/helpers';
import { cn } from '@/lib/utils';
import { normalizeAddCount, type EnumValueMeta } from '@ddlbuilder/shared-types';
import { buildDuplicateNameSet } from '@/stores/fieldStore';
import { useAppUiStore } from '@/stores/appUiStore';
import { useEditorStore } from '@/stores/editorStore';
import {
  FieldRowStateContext,
  useFieldColumns,
  getEditableColumnKeys,
  getFieldColumnKey,
  isFieldColumnVisible,
} from './table/columns';
import {
  fieldTableFeatures,
  type FieldTableColumnDef,
  type FieldTableRow,
} from './table/tableFeatures';
import { useFreezeColumns } from './table/useFreezeColumns';
import { DataTableToolbar } from './table/DataTableToolbar';
import { useDataTableNavigation } from './table/useDataTableNavigation';
import { useDataTableClipboard } from './table/useDataTableClipboard';
import { useFieldRowMutations } from './table/useFieldRowMutations';
import { useFieldTypeChangeGuard } from './table/useFieldTypeChangeGuard';
import { DangerousChangeDialog } from './table/DangerousChangeDialog';
import { useSortableFieldRows } from './table/useSortableFieldRows';
import { useTimers } from '@/hooks/useTimers';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useTranslation } from 'react-i18next';
import type { AICommentMode } from '@ddlbuilder/shared-types';
import type { AppLocale } from '@ddlbuilder/shared-types/locale';

interface DataTableProps {
  toolbarLeft?: ReactNode;
  isHighlighted?: boolean;
  highlightedRowIndex?: number | null;
  onOpenStorageEstimator?: () => void;
  onOpenMockDataGenerator?: () => void;
  onOpenAISchemaPatch?: () => void;
  onGenerateComments?: (mode: AICommentMode, targetLocale?: AppLocale) => void;
  isGeneratingComments?: boolean;
  onOpenAIIndexAdvisor?: () => void;
}

const COLUMN_WIDTHS = {
  order: 56,
  fieldName: 120,
  fieldComment: 120,
  fieldType: 128,
  nullable: 76,
  defaultKind: 84,
  defaultValue: 84,
  onUpdate: 100,
  actions: 40,
} satisfies Record<string, number>;

type EditingCell = { row: number; col: string };

type EditingCellEvent = { type: 'editStarted' | 'editEnded'; row: number; col: string };

function editingCellReducer(
  editing: EditingCell | null,
  event: EditingCellEvent,
): EditingCell | null {
  if (event.type === 'editStarted') return { row: event.row, col: event.col };

  return editing?.row === event.row && editing.col === event.col ? null : editing;
}

const reorderFeedbackReducer = (_visible: boolean, event: 'reordered' | 'expired') =>
  event === 'reordered';

const getEditorRows = () => useEditorStore.getState().rows;

interface SortableDataRowProps {
  row: FieldTableRow;
  columns: FieldTableColumnDef[];
  warnings: string[];
  selectedColumn: string | null;
  editingColumn: string | null;
  onEditingCellChange: (rowIndex: number, columnId: string, isEditing: boolean) => void;
  handleCellActivate: (rowIndex: number, columnId: string) => void;
  focusEditableCell: (rowIndex: number, columnId: string) => void;
  focusFirstInteractiveInCell: (cellElement: HTMLTableCellElement | null) => void;
  freezeEnabled: boolean;
  effectiveFreezeColumns: number;
  getStickyLeft: (colIndex: number) => number;
  isRowHighlighted: boolean;
  isRowSelected: boolean;
  dragFieldLabel: string;
}

function isCellContentEvent({ target, currentTarget }: SyntheticEvent<HTMLTableCellElement>) {
  // Portal 弹窗事件也会沿 React 树冒泡，但不属于单元格的 DOM 内容。
  return (
    target instanceof Element && currentTarget.contains(target) && !target.closest('input, button')
  );
}

// TanStack 在数据变化时会为每一行重建 Row 对象；按原始数据、序号和告警内容比较，只重渲染真正变化的行。
const areRowPropsEqual = (previous: SortableDataRowProps, next: SortableDataRowProps) =>
  previous.row.original === next.row.original &&
  previous.row.index === next.row.index &&
  previous.warnings.join('\n') === next.warnings.join('\n') &&
  Object.keys(next).every((key) => {
    // SAFETY: keys come from the props object being compared.
    const prop = key as keyof SortableDataRowProps;

    return prop === 'row' || prop === 'warnings' || Object.is(previous[prop], next[prop]);
  });

const SortableDataRow = memo<SortableDataRowProps>(function SortableDataRow({
  row,
  warnings,
  selectedColumn,
  editingColumn,
  onEditingCellChange,
  handleCellActivate,
  focusEditableCell,
  focusFirstInteractiveInCell,
  freezeEnabled,
  effectiveFreezeColumns,
  getStickyLeft,
  isRowHighlighted,
  isRowSelected,
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
    <FieldRowStateContext value={{ editingColumn, warnings }}>
      <tr
        ref={setNodeRef}
        style={{
          transform: CSS.Transform.toString(transform),
          transition,
        }}
        data-row-index={row.index}
        data-selected={isRowSelected || undefined}
        className={cn(
          'group/row transition-colors',
          isRowHighlighted && 'bg-blue-500/10 animate-row-highlight',
          isDragging && 'opacity-80',
        )}
      >
        {row.getAllCells().map((cell, colIndex) => {
          const isFrozen = freezeEnabled && colIndex < effectiveFreezeColumns;
          const isLastFrozen = freezeEnabled && colIndex === effectiveFreezeColumns - 1;
          const isSelected = selectedColumn === cell.column.id;
          const isOrderColumn = cell.column.id === 'order';

          return (
            <td
              key={cell.id}
              data-row-index={row.index}
              data-col-index={colIndex}
              data-column-id={cell.column.id}
              data-editing={editingColumn === cell.column.id || undefined}
              data-editable-column={cell.column.columnDef.meta?.editable || undefined}
              className={cn(
                'h-[var(--lm-row)] bg-background px-1 font-mono text-[13px] shadow-[inset_0_-1px_0_var(--line-faint)] transition-colors group-hover/row:bg-[color-mix(in_srgb,var(--mark)_30%,var(--paper))] group-data-selected/row:bg-[color-mix(in_srgb,var(--mark)_55%,var(--paper))]',
                cell.column.id === 'fieldComment' && 'font-text',
                isFrozen && 'relative sticky z-20 supports-[backdrop-filter]:backdrop-blur-[2px]',
                isLastFrozen &&
                  'border-r border-primary/30 shadow-[inset_0_-1px_0_var(--line-faint),8px_0_18px_-12px_hsl(var(--foreground)_/_0.22)] after:pointer-events-none after:absolute after:-right-3 after:top-0 after:h-full after:w-3 after:bg-gradient-to-r after:from-primary/20 after:to-transparent',
                isRowHighlighted && 'bg-blue-500/10',
                isSelected && 'ring-2 ring-primary ring-inset',
              )}
              style={{
                width: cell.column.getSize(),
                minWidth: cell.column.getSize(),
                left: isFrozen ? getStickyLeft(colIndex) : undefined,
              }}
              onPointerDown={(event) => {
                if (event.button !== 0 || !cell.column.columnDef.meta?.editable) return;
                if (!isCellContentEvent(event)) return;

                const isTextEditableCell =
                  cell.column.columnDef.meta?.editable === 'text' &&
                  !event.currentTarget.querySelector('[data-editable-cell-trigger][tabindex="-1"]');

                if (isTextEditableCell) {
                  commitActiveInputOutsideCell(event.currentTarget);
                  event.preventDefault();
                  onEditingCellChange(row.index, cell.column.id, true);
                  handleCellActivate(row.index, cell.column.id);
                  setTimeout(() => {
                    focusEditableCell(row.index, cell.column.id);
                  }, 0);

                  return;
                }

                handleCellActivate(row.index, cell.column.id);

                if (event.target !== event.currentTarget) return;
                focusFirstInteractiveInCell(event.currentTarget);
                setTimeout(() => {
                  focusEditableCell(row.index, cell.column.id);
                }, 0);
              }}
              onFocusCapture={() => {
                if (cell.column.columnDef.meta?.editable)
                  handleCellActivate(row.index, cell.column.id);
              }}
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
                    <DragDropVerticalIcon className="h-3.5 w-3.5" />
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
    </FieldRowStateContext>
  );
}, areRowPropsEqual);

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
    const rows = useEditorStore((state) => state.rows);
    const setRows = useEditorStore((state) => state.setRows);
    const onAddRows = useEditorStore((state) => state.handleAddRows);
    const onRemoveRow = useEditorStore((state) => state.handleRemoveRow);
    const dbType = useEditorStore((state) => state.dbType);
    const addCount = useEditorStore((state) => state.addCount);
    const onAddCountChange = useEditorStore((state) => state.setAddCount);
    const freezeEnabled = useEditorStore((state) => state.fieldTableFreezeEnabled);
    const onFreezeEnabledChange = useEditorStore((state) => state.setFieldTableFreezeEnabled);
    const freezeColumns = useEditorStore((state) => state.fieldTableFreezeColumns);
    const onFreezeColumnsChange = useEditorStore((state) => state.setFieldTableFreezeColumns);

    const duplicateNameSet = useMemo(() => buildDuplicateNameSet(rows), [rows]);
    const tableRef = useRef<HTMLDivElement>(null);
    const { schedule, clearAll } = useTimers();

    const [reorderFeedbackVisible, dispatchReorderFeedback] = useReducer(
      reorderFeedbackReducer,
      false,
    );

    const [editingCell, dispatchEditingCell] = useReducer(editingCellReducer, null);

    const handleEditingCellChange = useCallback(
      (rowIndex: number, columnId: string, isEditing: boolean) => {
        dispatchEditingCell({
          type: isEditing ? 'editStarted' : 'editEnded',
          row: rowIndex,
          col: columnId,
        });
      },
      [],
    );

    const { updateCellValue } = useFieldRowMutations({ setRows });

    const { guardedUpdateCellValue, pendingChange, handleConfirm, handleCancel } =
      useFieldTypeChangeGuard(getEditorRows, updateCellValue);

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

    const setActiveFieldId = useAppUiStore((state) => state.setActiveFieldId);

    const handleRowSelected = useCallback(
      (rowIndex: number | null) =>
        setActiveFieldId(rowIndex === null ? null : (rows[rowIndex]?.id ?? null)),
      [rows, setActiveFieldId],
    );

    const {
      selectedCell,
      clearSelection,
      focusEditableCell,
      focusFirstInteractiveInCell,
      handleCellActivate,
      handleTabNavigation,
    } = useDataTableNavigation({ tableRef, onRowSelected: handleRowSelected });

    const hiddenColumns = usePreferencesStore((state) => state.hiddenFieldColumns);

    const allColumns = useFieldColumns({
      columnWidths: COLUMN_WIDTHS,
      onEditingCellChange: handleEditingCellChange,
      dbType,
      updateCellValue: guardedUpdateCellValue,
      updateEnumValues,
      handleTabNavigation,
      onRemoveRow,
    });

    const columns = useMemo(
      () => allColumns.filter((column) => isFieldColumnVisible(column, hiddenColumns)),
      [allColumns, hiddenColumns],
    );
    const columnKeys = useMemo(() => columns.map(getFieldColumnKey), [columns]);
    const editableColumnKeys = useMemo(() => getEditableColumnKeys(columns), [columns]);

    const { handlePaste } = useDataTableClipboard({
      rows,
      setRows,
      selectedCell,
      editableColumnKeys,
      clearSelection,
    });

    const table = useTable({
      features: fieldTableFeatures,
      data: rows,
      columns,
      getRowId: (row) => row.id,
    });

    const handleDragResult = useCallback(
      ({ moved }: { moved: boolean }) => {
        if (!moved) return;
        clearAll();
        dispatchReorderFeedback('reordered');
        schedule(() => dispatchReorderFeedback('expired'), 1600);
      },
      [clearAll, schedule],
    );

    const { sensors, rowIds, handleDragMove, handleDragEnd } = useSortableFieldRows({
      rows,
      setRows,
      onDragResult: handleDragResult,
    });

    const { getStickyLeft, frozenAreaWidth, effectiveFreezeColumns } = useFreezeColumns(
      COLUMN_WIDTHS,
      freezeEnabled,
      freezeColumns,
      columnKeys,
    );

    const safeAddCount = normalizeAddCount(addCount);

    const handleAddRowsClick = useCallback(() => {
      onAddRows(safeAddCount);
    }, [onAddRows, safeAddCount]);

    return (
      <div
        className={cn(
          'relative min-w-0 flex-1 bg-background',
          isHighlighted && 'animate-field-highlight',
        )}
        onPaste={handlePaste}
      >
        {isHighlighted && (
          <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-blue-500 animate-pulse z-10" />
        )}

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
        {reorderFeedbackVisible && (
          <output
            aria-live="polite"
            className="absolute right-4 top-3 z-20 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-[11px] text-primary"
            data-testid="field-drag-feedback"
          >
            {t('dataTable.dragReordered')}
          </output>
        )}

        <section
          ref={tableRef}
          aria-label={t('dataTable.ariaLabel')}
          className="relative overflow-auto py-2"
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
                className={cn(
                  'border-separate border-spacing-0 table-fixed text-xs',
                  !freezeEnabled && 'w-full',
                )}
                style={{ minWidth: table.getTotalSize() }}
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
                              'h-[30px] whitespace-nowrap bg-background px-2 text-left text-xs font-normal text-muted-foreground shadow-[inset_0_-1px_0_var(--line)]',
                              isFrozen &&
                                'relative sticky z-30 supports-[backdrop-filter]:backdrop-blur-[2px]',
                              isLastFrozen &&
                                'border-r border-primary/30 shadow-[inset_0_-1px_0_var(--line),8px_0_18px_-12px_hsl(var(--foreground)_/_0.22)] after:pointer-events-none after:absolute after:-right-3 after:top-0 after:h-full after:w-3 after:bg-gradient-to-r after:from-primary/20 after:to-transparent',
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
                      columns={columns}
                      warnings={rowWarnings[row.index] ?? []}
                      selectedColumn={selectedCell?.row === row.index ? selectedCell.col : null}
                      isRowSelected={selectedCell?.row === row.index}
                      editingColumn={editingCell?.row === row.index ? editingCell.col : null}

                      onEditingCellChange={handleEditingCellChange}
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
