import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { HardDrive, Minus, Plus, Pin, ListPlus } from 'lucide-react';
import { toStringSafe, isReservedKeyword } from '@/utils/helpers';
import { COLUMN_HEADERS } from '@/utils/constants';
import { cn } from '@/lib/utils';
import {
  buildDuplicateNameSet,
  useAppStore,
  useFieldStore,
  useIndexStore,
  usePartitionStore,
  useShardingStore,
} from '@/stores';
import { useFieldColumns } from './table/columns';
import { useFreezeColumns } from './table/useFreezeColumns';
import { useRowHighlight } from './table/useRowHighlight';

interface DataTableProps {
  toolbarLeft?: React.ReactNode;
  isHighlighted?: boolean;
  highlightedRowIndex?: number | null;
  onOpenStorageEstimator?: () => void;
}

// Helper to normalize nullable values from various formats
const parseNullable = (value: string): string => {
  if (!value) return '是';
  const v = value.trim().toLowerCase();
  // Check for "not nullable" values
  const notNullableValues = new Set([
    'n',
    'no',
    '否',
    'false',
    '0',
    'not null',
    'notnull',
  ]);
  if (notNullableValues.has(v)) {
    return '否';
  }
  return '是'; // Default to nullable (yes, y, 是, true, 1, null, etc.)
};

export const DataTable = memo<DataTableProps>(
  ({
    toolbarLeft,
    isHighlighted,
    highlightedRowIndex,
    onOpenStorageEstimator,
  }) => {
    const rows = useFieldStore((state) => state.rows);
    const setRows = useFieldStore((state) => state.setRows);
    const onAddRows = useFieldStore((state) => state.handleAddRows);
    const onRemoveRow = useFieldStore((state) => state.handleRemoveRow);
    const dbType = useAppStore((state) => state.dbType);
    const addCount = useAppStore((state) => state.addCount);
    const onAddCountChange = useAppStore((state) => state.setAddCount);
    const freezeEnabled = useAppStore((state) => state.fieldTableFreezeEnabled);
    const onFreezeEnabledChange = useAppStore(
      (state) => state.setFieldTableFreezeEnabled,
    );
    const freezeColumns = useAppStore((state) => state.fieldTableFreezeColumns);
    const onFreezeColumnsChange = useAppStore(
      (state) => state.setFieldTableFreezeColumns,
    );
    const syncIndexFieldRename = useIndexStore(
      (state) => state.syncFieldRename,
    );
    const syncPartitionFieldRename = usePartitionStore(
      (state) => state.syncFieldRename,
    );
    const syncShardingFieldRename = useShardingStore(
      (state) => state.syncFieldRename,
    );

    const duplicateNameSet = useMemo(() => buildDuplicateNameSet(rows), [rows]);
    const tableRef = useRef<HTMLDivElement>(null);

    // Column resize state
    const [columnWidths] = useState<Record<string, number>>({
      order: 48,
      fieldName: 120,
      fieldComment: 150,
      fieldType: 120,
      nullable: 70,
      defaultKind: 110,
      defaultValue: 100,
      onUpdate: 100,
      actions: 50,
    });

    // Selected cell for paste position
    const [selectedCell, setSelectedCell] = useState<{
      row: number;
      col: number;
    } | null>(null);

    // Column keys for paste mapping
    const editableColumnKeys = [
      'fieldName',
      'fieldComment',
      'fieldType',
      'nullable',
      'defaultKind',
      'defaultValue',
      'onUpdate',
    ] as const;

    // Update cell value helper
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
      },
      [
        dbType,
        syncIndexFieldRename,
        syncPartitionFieldRename,
        syncShardingFieldRename,
      ],
    );

    const updateCellValue = useCallback(
      (rowIndex: number, columnId: string, value: string | boolean) => {
        if (columnId === 'fieldName') {
          const oldFieldName = rows[rowIndex]?.fieldName || '';
          const newFieldName = String(value ?? '');
          syncFieldRenameDependencies(oldFieldName, newFieldName);
        }

        setRows((prev) => {
          const newRows = [...prev];
          const row = { ...newRows[rowIndex] };

          if (columnId === 'nullable') {
            row.nullable = value ? '是' : '否';
          } else {
            (row as Record<string, unknown>)[columnId] = value;
          }

          // Handle special field logic
          if (columnId === 'defaultKind') {
            const kind = String(value ?? '');
            if (kind !== '常量') {
              row.defaultValue = '';
            }
            if (kind === '自增') {
              row.nullable = '否';
            }
          }

          newRows[rowIndex] = row;
          return newRows;
        });
      },
      [rows, setRows, syncFieldRenameDependencies],
    );

    // Row warnings calculation
    const rowWarnings = useMemo(() => {
      return rows.map((row) => {
        const warnings: string[] = [];
        const name = toStringSafe(row?.fieldName).trim();
        if (!name) return warnings;
        if (duplicateNameSet.has(name)) warnings.push('字段名重复');
        if (isReservedKeyword(dbType, name))
          warnings.push('字段名为数据库保留关键字');
        return warnings;
      });
    }, [rows, duplicateNameSet, dbType]);

    const focusFirstInteractiveInCell = useCallback(
      (cellElement: HTMLTableCellElement | null) => {
        const focusTarget = cellElement?.querySelector<HTMLElement>(
          'input:not([disabled]), div[tabindex="0"], button:not([disabled])',
        );
        focusTarget?.focus();
      },
      [],
    );

    // Keep selected cell synced with focused/clicked editable cell
    const handleCellActivate = useCallback(
      (rowIndex: number, colIndex: number) => {
        // Only allow selection of editable columns (skip order column at 0 and actions column at end)
        if (colIndex >= 1 && colIndex <= editableColumnKeys.length) {
          const nextCol = colIndex - 1; // Adjust for order column
          setSelectedCell((prev) => {
            if (prev?.row === rowIndex && prev.col === nextCol) {
              return prev;
            }
            return { row: rowIndex, col: nextCol };
          });
        }
      },
      [editableColumnKeys.length],
    );

    const focusEditableCell = useCallback(
      (rowIndex: number, editableColIndex: number) => {
        if (rowIndex < 0 || rowIndex >= rows.length) return;
        if (
          editableColIndex < 0 ||
          editableColIndex >= editableColumnKeys.length
        )
          return;

        const tableColIndex = editableColIndex + 1;
        const cellElement =
          tableRef.current?.querySelector<HTMLTableCellElement>(
            `td[data-row-index="${rowIndex}"][data-col-index="${tableColIndex}"]`,
          );
        if (!cellElement) return;

        handleCellActivate(rowIndex, tableColIndex);
        focusFirstInteractiveInCell(cellElement);
      },
      [
        rows.length,
        editableColumnKeys.length,
        handleCellActivate,
        focusFirstInteractiveInCell,
      ],
    );

    const handleTabNavigation = useCallback(
      (rowIndex: number, editableColIndex: number, direction: 1 | -1) => {
        let nextRow = rowIndex;
        let nextCol = editableColIndex + direction;
        const lastEditableCol = editableColumnKeys.length - 1;

        while (nextRow >= 0 && nextRow < rows.length) {
          if (nextCol > lastEditableCol) {
            nextRow += 1;
            nextCol = 0;
            continue;
          }
          if (nextCol < 0) {
            nextRow -= 1;
            nextCol = lastEditableCol;
            continue;
          }
          focusEditableCell(nextRow, nextCol);
          return;
        }
      },
      [editableColumnKeys.length, rows.length, focusEditableCell],
    );

    // Define columns via extracted hook
    const columns = useFieldColumns({
      columnWidths,
      rowWarnings,
      dbType,
      updateCellValue,
      handleTabNavigation,
      onRemoveRow,
    });

    const table = useReactTable({
      data: rows,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getRowId: (row) => String(row.order),
    });

    // Freeze columns
    const { getStickyLeft, frozenAreaWidth, effectiveFreezeColumns } =
      useFreezeColumns(columnWidths, freezeEnabled, freezeColumns);

    // Row highlight animation
    useRowHighlight(tableRef, highlightedRowIndex);

    const safeAddCount =
      Number.isFinite(addCount) && addCount > 0 ? Math.floor(addCount) : 1;

    const handleAddRowsClick = useCallback(() => {
      onAddRows(safeAddCount);
    }, [onAddRows, safeAddCount]);

    // Handle paste from Excel/spreadsheet
    // Pastes at selected cell position, or appends to end if no selection
    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        const clipboardData = e.clipboardData?.getData('text/plain');
        if (!clipboardData) return;

        // Ignore paste if target is an input/textarea (allow default behavior for editing)
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        ) {
          return;
        }

        // Parse tab-separated values (Excel format)
        const pastedRows = clipboardData
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => line.split('\t'));

        if (pastedRows.length === 0) return;

        // Prevent default paste behavior
        e.preventDefault();

        const startRow = selectedCell?.row ?? rows.length;
        const startCol = selectedCell?.col ?? 0;

        const renamePairs: Array<{ oldName: string; newName: string }> = [];
        const newRows = [...rows];

        pastedRows.forEach((cols, rowOffset) => {
          const targetRowIndex = startRow + rowOffset;

          while (newRows.length <= targetRowIndex) {
            newRows.push({
              order: newRows.length + 1,
              fieldName: '',
              fieldComment: '',
              fieldType: '',
              nullable: '是',
              defaultKind: '无',
              defaultValue: '',
              onUpdate: '无',
            });
          }

          const row = { ...newRows[targetRowIndex] };
          cols.forEach((cellValue, colOffset) => {
            const targetColIndex = startCol + colOffset;
            if (targetColIndex >= editableColumnKeys.length) return;

            const key = editableColumnKeys[targetColIndex];
            const value = cellValue?.trim() || '';

            if (key === 'fieldName') {
              const oldName = row.fieldName || '';
              const newName = value;
              if (oldName && newName && oldName !== newName) {
                renamePairs.push({ oldName, newName });
              }
            }

            if (key === 'nullable') {
              row.nullable = parseNullable(value);
            } else {
              (row as Record<string, unknown>)[key] =
                value ||
                (key === 'defaultKind' || key === 'onUpdate' ? '无' : '');
            }
          });
          newRows[targetRowIndex] = row;
        });

        setRows(newRows.map((row, idx) => ({ ...row, order: idx + 1 })));

        renamePairs.forEach(({ oldName, newName }) => {
          syncFieldRenameDependencies(oldName, newName);
        });

        // Clear selection after paste
        setSelectedCell(null);
      },
      [
        setRows,
        selectedCell,
        rows,
        editableColumnKeys,
        syncFieldRenameDependencies,
      ],
    );

    return (
      <div
        className={cn(
          'relative min-h-[420px] flex-1 rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5',
          isHighlighted && 'animate-field-highlight',
        )}
        onPaste={handlePaste}
      >
        {/* Field change highlight overlay */}
        {isHighlighted && (
          <div className="pointer-events-none absolute inset-0 rounded-lg border-2 border-blue-500 animate-pulse z-10" />
        )}

        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-lg" />

        {/* Top gradient bar */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-primary/30 to-transparent" />

        <div className="relative border-b border-primary/10 px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left toolbar slot */}
            <div className="flex flex-wrap items-center gap-2">
              {toolbarLeft}
              {onOpenStorageEstimator && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenStorageEstimator}
                  className="h-7 gap-1.5 px-2 text-xs font-medium transition-all duration-200 hover:scale-105 hover:shadow-md border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-primary"
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  估算容量
                </Button>
              )}
            </div>

            {/* Right side: Add rows button */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Freeze Control Group */}
              <div className="flex h-7 items-center rounded-md border shadow-sm transition-all hover:shadow-md bg-background">
                <div className="flex h-full items-center gap-2 border-r bg-muted/30 px-2 pl-2.5">
                  <Label
                    htmlFor="field-freeze-switch"
                    className="flex cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground select-none"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    冻结
                  </Label>
                  <Switch
                    id="field-freeze-switch"
                    checked={freezeEnabled}
                    onCheckedChange={onFreezeEnabledChange}
                    className="scale-75 data-[state=checked]:bg-primary"
                    aria-label="启用字段表格列冻结"
                  />
                </div>
                <div className="flex h-full items-center gap-1 px-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={!freezeEnabled || effectiveFreezeColumns <= 1}
                    onClick={() =>
                      onFreezeColumnsChange(
                        Math.max(1, effectiveFreezeColumns - 1),
                      )
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span
                    className={cn(
                      'min-w-[1.25rem] text-center text-xs font-medium tabular-nums',
                      !freezeEnabled && 'text-muted-foreground opacity-50',
                    )}
                  >
                    {effectiveFreezeColumns}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={
                      !freezeEnabled ||
                      effectiveFreezeColumns >= COLUMN_HEADERS.length
                    }
                    onClick={() =>
                      onFreezeColumnsChange(
                        Math.min(
                          COLUMN_HEADERS.length,
                          effectiveFreezeColumns + 1,
                        ),
                      )
                    }
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Label
                    className={cn(
                      'ml-0.5 text-xs text-muted-foreground',
                      !freezeEnabled && 'opacity-50',
                    )}
                  >
                    列
                  </Label>
                </div>
              </div>

              {/* Add Row Control Group */}
              <div className="flex h-7 items-center rounded-md border shadow-sm transition-all hover:shadow-md bg-background">
                <Button
                  onClick={handleAddRowsClick}
                  variant="ghost"
                  size="sm"
                  className="h-full rounded-none rounded-l-md border-r px-3 text-xs font-medium hover:bg-muted/50"
                >
                  <ListPlus className="mr-1.5 h-3.5 w-3.5" />
                  添加行
                </Button>
                <div className="flex h-full items-center gap-1 px-1.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    disabled={safeAddCount <= 1}
                    onClick={() =>
                      onAddCountChange(Math.max(1, safeAddCount - 1))
                    }
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="min-w-[1.25rem] text-center text-xs font-medium tabular-nums">
                    {safeAddCount}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => onAddCountChange(safeAddCount + 1)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <span className="ml-0.5 text-xs text-muted-foreground">
                    行
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <section
          ref={tableRef}
          aria-label="字段配置表格"
          className="relative overflow-x-auto p-4"
        >
          <p id="field-config-table-description" className="sr-only">
            可编辑字段配置表格，包含字段名、字段类型、注释、可空与默认值等列。
          </p>
          {freezeEnabled && frozenAreaWidth > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute bottom-4 left-4 top-4 z-10 rounded-l-md bg-gradient-to-r from-primary/[0.07] via-primary/[0.03] to-transparent transition-[width] duration-200"
              style={{ width: frozenAreaWidth }}
            />
          )}
          <table
            className="w-full border-collapse text-sm"
            data-testid="data-table"
            aria-label="字段配置表格"
            aria-describedby="field-config-table-description"
          >
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b border-border/50">
                  {headerGroup.headers.map((header, colIndex) => {
                    const isFrozen =
                      freezeEnabled && colIndex < effectiveFreezeColumns;
                    const isLastFrozen =
                      freezeEnabled && colIndex === effectiveFreezeColumns - 1;
                    return (
                      <th
                        key={header.id}
                        className={cn(
                          'h-10 px-2 text-left text-sm font-medium text-muted-foreground',
                          isFrozen
                            ? 'relative sticky z-30 bg-gradient-to-r from-background to-background/95 supports-[backdrop-filter]:bg-background/85 supports-[backdrop-filter]:backdrop-blur-[2px]'
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
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => {
                const isRowHighlighted = highlightedRowIndex === row.index;
                return (
                  <tr
                    key={row.id}
                    data-row-index={row.index}
                    className={cn(
                      'group/row border-b border-border/30 transition-colors hover:bg-muted/30',
                      isRowHighlighted && 'bg-blue-500/10',
                    )}
                  >
                    {row.getVisibleCells().map((cell, colIndex) => {
                      const isFrozen =
                        freezeEnabled && colIndex < effectiveFreezeColumns;
                      const isLastFrozen =
                        freezeEnabled &&
                        colIndex === effectiveFreezeColumns - 1;
                      const isSelected =
                        selectedCell &&
                        selectedCell.row === row.index &&
                        selectedCell.col === colIndex - 1; // Adjust for order column
                      return (
                        <td
                          key={cell.id}
                          data-row-index={row.index}
                          data-col-index={colIndex}
                          className={cn(
                            'h-10 px-1 bg-background transition-colors group-hover/row:bg-muted/30',
                            isFrozen &&
                              'relative sticky z-20 bg-gradient-to-r from-background to-background/95 supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-[2px] group-hover/row:bg-muted/35',
                            isLastFrozen &&
                              'border-r border-primary/30 shadow-[8px_0_18px_-12px_hsl(var(--foreground)_/_0.22)] after:pointer-events-none after:absolute after:-right-3 after:top-0 after:h-full after:w-3 after:bg-gradient-to-r after:from-primary/20 after:to-transparent',
                            isRowHighlighted && 'bg-blue-500/10',
                            isSelected && 'ring-2 ring-primary ring-inset',
                          )}
                          style={{
                            width: cell.column.getSize(),
                            minWidth: cell.column.getSize(),
                            left: isFrozen
                              ? getStickyLeft(colIndex)
                              : undefined,
                          }}
                          onClick={(event) => {
                            handleCellActivate(row.index, colIndex);
                            focusFirstInteractiveInCell(event.currentTarget);
                          }}
                          onFocusCapture={() =>
                            handleCellActivate(row.index, colIndex)
                          }
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    );
  },
);

DataTable.displayName = 'DataTable';
