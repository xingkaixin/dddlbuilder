import { memo, useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
  type ColumnDef,
} from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HardDrive, Trash2 } from 'lucide-react';
import { EditableCell, SelectCell, CheckboxCell, OrderCell } from './table';
import type { FieldRow, UiDefaultKind } from '@/types';
import {
  toStringSafe,
  isReservedKeyword,
  normalizeDefaultKind,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
} from '@/utils/helpers';
import { getCanonicalBaseType } from '@/utils/databaseTypeMapping';
import { COLUMN_HEADERS } from '@/utils/constants';
import { cn } from '@/lib/utils';
import { buildDuplicateNameSet, useAppStore, useFieldStore } from '@/stores';

const columnHelper = createColumnHelper<FieldRow>();

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

    // Delete confirmation dialog state
    const [deleteConfirm, setDeleteConfirm] = useState<{
      open: boolean;
      rowIndex: number;
      fieldName: string;
      fieldComment: string;
    }>({ open: false, rowIndex: -1, fieldName: '', fieldComment: '' });

    // Update cell value helper
    const updateCellValue = useCallback(
      (rowIndex: number, columnId: string, value: string | boolean) => {
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
      [setRows],
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

    // Define columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const columns = useMemo<ColumnDef<FieldRow, any>[]>(
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
          cell: ({ row }) => {
            const hasContent =
              row.original.fieldName?.trim() ||
              row.original.fieldComment?.trim();

            const handleDelete = () => {
              if (hasContent) {
                // Show confirmation dialog
                setDeleteConfirm({
                  open: true,
                  rowIndex: row.index,
                  fieldName: row.original.fieldName || '',
                  fieldComment: row.original.fieldComment || '',
                });
              } else {
                // Direct delete for empty rows
                onRemoveRow(row.index, 1);
              }
            };

            return (
              <div className="flex h-8 items-center justify-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={handleDelete}
                  title="删除行"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          },
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

    const table = useReactTable({
      data: rows,
      columns,
      getCoreRowModel: getCoreRowModel(),
      getRowId: (row) => String(row.order),
    });

    const safeAddCount =
      Number.isFinite(addCount) && addCount > 0 ? Math.floor(addCount) : 1;
    const safeFreezeColumns =
      Number.isFinite(freezeColumns) && freezeColumns > 0
        ? Math.floor(freezeColumns)
        : 1;
    const effectiveFreezeColumns = Math.min(
      safeFreezeColumns,
      COLUMN_HEADERS.length,
    );
    const freezeColumnKeys = useMemo(
      () => [
        'order',
        'fieldName',
        'fieldComment',
        'fieldType',
        'nullable',
        'defaultKind',
        'defaultValue',
        'onUpdate',
        'actions',
      ],
      [],
    );

    const handleAddRowsClick = useCallback(() => {
      onAddRows(safeAddCount);
    }, [onAddRows, safeAddCount]);

    // Row highlight animation
    useEffect(() => {
      if (highlightedRowIndex == null || highlightedRowIndex < 0) return;

      const rowElement = tableRef.current?.querySelector(
        `[data-row-index="${highlightedRowIndex}"]`,
      );
      if (!rowElement) return;

      rowElement.classList.add('animate-row-highlight');

      const timeout = setTimeout(() => {
        rowElement.classList.remove('animate-row-highlight');
      }, 1200);

      return () => clearTimeout(timeout);
    }, [highlightedRowIndex]);

    // Calculate sticky left positions for frozen columns
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

    // Handle paste from Excel/spreadsheet
    // Pastes at selected cell position, or appends to end if no selection
    const handlePaste = useCallback(
      (e: React.ClipboardEvent) => {
        const clipboardData = e.clipboardData?.getData('text/plain');
        if (!clipboardData) return;

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

        setRows((prev) => {
          const newRows = [...prev];

          pastedRows.forEach((cols, rowOffset) => {
            const targetRowIndex = startRow + rowOffset;

            // Ensure row exists
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

            // Update cells starting from startCol
            const row = { ...newRows[targetRowIndex] };
            cols.forEach((cellValue, colOffset) => {
              const targetColIndex = startCol + colOffset;
              if (targetColIndex >= editableColumnKeys.length) return;

              const key = editableColumnKeys[targetColIndex];
              const value = cellValue?.trim() || '';

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

          // Re-order all rows
          return newRows.map((row, idx) => ({ ...row, order: idx + 1 }));
        });

        // Clear selection after paste
        setSelectedCell(null);
      },
      [setRows, selectedCell, rows.length, editableColumnKeys],
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
                  className="gap-2 transition-all duration-200 hover:scale-105 hover:shadow-md border-primary/20 hover:border-primary/50 text-muted-foreground hover:text-primary"
                >
                  <HardDrive className="h-4 w-4" />
                  估算容量
                </Button>
              )}
            </div>

            {/* Right side: Add rows button */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-md px-3 py-1.5">
                <Label
                  htmlFor="field-freeze-switch"
                  className="text-sm text-muted-foreground select-none"
                >
                  冻结
                </Label>
                <Switch
                  id="field-freeze-switch"
                  checked={freezeEnabled}
                  onCheckedChange={onFreezeEnabledChange}
                  aria-label="启用字段表格列冻结"
                />
                <Input
                  id="field-freeze-columns-input"
                  type="number"
                  min={1}
                  max={COLUMN_HEADERS.length}
                  step={1}
                  value={effectiveFreezeColumns}
                  disabled={!freezeEnabled}
                  name="freeze-columns"
                  aria-label="冻结列数"
                  aria-describedby="field-freeze-columns-description"
                  onChange={(e) => {
                    const parsed = Math.floor(Number(e.target.value));
                    onFreezeColumnsChange(
                      Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                    );
                  }}
                  className="w-20 transition-all duration-200 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <Label
                  htmlFor="field-freeze-columns-input"
                  className="text-sm text-muted-foreground"
                >
                  列
                </Label>
                <span id="field-freeze-columns-description" className="sr-only">
                  设置冻结前 N 列，横向滚动时保持可见
                </span>
              </div>
              <Button
                onClick={handleAddRowsClick}
                className="transition-all duration-200 hover:scale-105 hover:shadow-md"
              >
                添加行
              </Button>
              <div className="flex items-center gap-2 group/counter">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={safeAddCount}
                  name="add-row-count"
                  aria-label="添加行数"
                  onChange={(e) => {
                    const parsed = Math.floor(Number(e.target.value));
                    onAddCountChange(
                      Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                    );
                  }}
                  className="w-24 transition-all duration-200 focus:ring-2 focus:ring-primary/20 group-hover/counter:border-primary/30"
                />
                <span className="text-sm text-muted-foreground transition-colors duration-200 group-hover/counter:text-foreground">
                  行数
                </span>
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

        {/* Delete confirmation dialog */}
        <AlertDialog
          open={deleteConfirm.open}
          onOpenChange={(open) =>
            setDeleteConfirm((prev) => ({ ...prev, open }))
          }
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除字段行</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除此行吗？
                <br />
                <span className="mt-2 block text-foreground">
                  字段名: {deleteConfirm.fieldName || '(空)'}
                </span>
                <span className="block text-foreground">
                  中文名: {deleteConfirm.fieldComment || '(空)'}
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onRemoveRow(deleteConfirm.rowIndex, 1);
                  setDeleteConfirm((prev) => ({ ...prev, open: false }));
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                确定删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
);

DataTable.displayName = 'DataTable';
