import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import { toStringSafe, isReservedKeyword } from '@/utils/helpers';
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
import { DataTableToolbar } from './table/DataTableToolbar';
import { useDataTableNavigation } from './table/useDataTableNavigation';
import { useDataTableClipboard } from './table/useDataTableClipboard';
import { useTranslation } from 'react-i18next';

interface DataTableProps {
  toolbarLeft?: ReactNode;
  isHighlighted?: boolean;
  highlightedRowIndex?: number | null;
  onOpenStorageEstimator?: () => void;
}

export const DataTable = memo<DataTableProps>(
  ({
    toolbarLeft,
    isHighlighted,
    highlightedRowIndex,
    onOpenStorageEstimator,
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

    const rowWarnings = useMemo(() => {
      return rows.map((row) => {
        const warnings: string[] = [];
        const name = toStringSafe(row?.fieldName).trim();
        if (!name) return warnings;
        if (duplicateNameSet.has(name))
          warnings.push(t('dataTable.duplicateName'));
        if (isReservedKeyword(dbType, name))
          warnings.push(t('dataTable.reservedKeyword'));
        return warnings;
      });
    }, [rows, duplicateNameSet, dbType, t]);

    const {
      selectedCell,
      setSelectedCell,
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

    const { getStickyLeft, frozenAreaWidth, effectiveFreezeColumns } =
      useFreezeColumns(columnWidths, freezeEnabled, freezeColumns);

    useRowHighlight(tableRef, highlightedRowIndex);

    const safeAddCount =
      Number.isFinite(addCount) && addCount > 0 ? Math.floor(addCount) : 1;

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
          freezeEnabled={freezeEnabled}
          onFreezeEnabledChange={onFreezeEnabledChange}
          effectiveFreezeColumns={effectiveFreezeColumns}
          onFreezeColumnsChange={onFreezeColumnsChange}
          safeAddCount={safeAddCount}
          onAddCountChange={onAddCountChange}
          onAddRowsClick={handleAddRowsClick}
        />

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
          <table
            className="w-full border-collapse text-sm"
            data-testid="data-table"
            aria-label={t('dataTable.ariaLabel')}
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
                        selectedCell.col === colIndex - 1;
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
