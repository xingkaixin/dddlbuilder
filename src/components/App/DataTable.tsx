import { memo, useCallback, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { HardDrive } from 'lucide-react';
import {
  AutocompleteCellType,
  CheckboxCellType,
  DropdownCellType,
  TextCellType,
  registerCellType,
} from 'handsontable/cellTypes';
import { registerPlugin } from 'handsontable/plugins';
import { AutoColumnSize } from 'handsontable/plugins/autoColumnSize';
import { ContextMenu } from 'handsontable/plugins/contextMenu';
import { CopyPaste } from 'handsontable/plugins/copyPaste';
import { ManualColumnResize } from 'handsontable/plugins/manualColumnResize';
import { StretchColumns } from 'handsontable/plugins/stretchColumns';
import { UndoRedo } from 'handsontable/plugins/undoRedo';
import { HotTable } from '@handsontable/react-wrapper';
import 'handsontable/styles/handsontable.css';
import 'handsontable/styles/ht-theme-main.css';
import type Handsontable from 'handsontable';
import type { UiDefaultKind } from '@/types';
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

let handsontableModulesRegistered = false;

const ensureHandsontableModules = () => {
  if (handsontableModulesRegistered) return;
  registerCellType(AutocompleteCellType);
  registerCellType(CheckboxCellType);
  registerCellType(DropdownCellType);
  registerCellType(TextCellType);
  registerPlugin(AutoColumnSize);
  registerPlugin(ContextMenu);
  registerPlugin(CopyPaste);
  registerPlugin(ManualColumnResize);
  registerPlugin(StretchColumns);
  registerPlugin(UndoRedo);
  handsontableModulesRegistered = true;
};

ensureHandsontableModules();

const COLUMN_SETTINGS: Handsontable.ColumnSettings[] = [
  { data: 'order', readOnly: true, width: 48, className: 'htCenter' },
  { data: 'fieldName', type: 'text' },
  { data: 'fieldComment', type: 'text' },
  { data: 'fieldType', type: 'text' },
  {
    data: 'nullable',
    type: 'checkbox',
    className: 'htCenter',
    checkedTemplate: '是',
    uncheckedTemplate: '否',
  },
  {
    data: 'defaultKind',
    type: 'dropdown',
    source: [],
    allowInvalid: false,
  },
  { data: 'defaultValue', type: 'text' },
  {
    data: 'onUpdate',
    type: 'dropdown',
    source: [],
    allowInvalid: false,
  },
];

interface DataTableProps {
  /** 工具栏左侧插槽，用于添加额外按钮（如"应用模板"） */
  toolbarLeft?: React.ReactNode;
  /** 是否显示字段变更高亮动画 */
  isHighlighted?: boolean;
  /** 需要高亮的行索引 */
  highlightedRowIndex?: number | null;
  /** 打开存储估算按钮的回调 */
  onOpenStorageEstimator?: () => void;
}

export const DataTable = memo<DataTableProps>(
  ({
    toolbarLeft,
    isHighlighted,
    highlightedRowIndex,
    onOpenStorageEstimator,
  }) => {
    const rows = useFieldStore((state) => state.rows);
    const onRowsChange = useFieldStore((state) => state.handleRowsChange);
    const onCreateRow = useFieldStore((state) => state.handleCreateRow);
    const onRemoveRow = useFieldStore((state) => state.handleRemoveRow);
    const onAddRows = useFieldStore((state) => state.handleAddRows);
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

    const latestRef = useRef({ rows, dbType });
    latestRef.current = { rows, dbType };

    // Ref for Handsontable instance
    const hotRef = useRef<any>(null);

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

    const columns = useMemo<Handsontable.ColumnSettings[]>(() => {
      return COLUMN_SETTINGS.map((col) => {
        if (col.data !== 'order') return col;
        return {
          ...col,
          renderer: (
            _instance,
            td,
            row,
            _colIndex,
            _prop,
            value,
            _cellProperties,
          ) => {
            while (td.firstChild) td.removeChild(td.firstChild);
            td.classList.add('htOrderCell');
            const wrapper = document.createElement('span');
            wrapper.className = 'htOrderCellInner';
            const label = document.createElement('span');
            label.className = 'htOrderValue';
            label.textContent = value == null ? '' : String(value);
            wrapper.appendChild(label);
            const warnings = rowWarnings[row];
            if (warnings?.length) {
              td.classList.add('htOrderHasWarning');
              const icon = document.createElement('span');
              icon.className = 'htOrderWarningIcon';
              const tooltip = warnings.join('，');
              icon.setAttribute('title', tooltip);
              icon.setAttribute('aria-label', tooltip);
              icon.textContent = '!';
              wrapper.appendChild(icon);
            } else {
              td.classList.remove('htOrderHasWarning');
            }
            td.appendChild(wrapper);
          },
        };
      });
    }, [rowWarnings]);

    // Enhanced cells function extracted from App.tsx
    const cells = useCallback(
      (row: number, _col: number, prop?: string | number) => {
        const { rows: currentRows, dbType: currentDbType } = latestRef.current;
        const cellProps: Handsontable.CellMeta = {};

        if (prop === 'defaultValue') {
          const kind = normalizeDefaultKind(
            currentRows[row]?.defaultKind as UiDefaultKind,
          );
          if (kind !== 'constant') {
            cellProps.readOnly = true;
            cellProps.type = 'text';
            cellProps.className = `${
              cellProps.className ? cellProps.className + ' ' : ''
            }htDimmed`;
          }
        }

        if (prop === 'defaultKind' || prop === 'onUpdate') {
          const base = getCanonicalBaseType(
            toStringSafe(currentRows[row]?.fieldType),
          );
          const dd = cellProps as Handsontable.CellMeta & {
            source?: string[];
          };

          if (prop === 'defaultKind') {
            const opts = getUiDefaultKindOptions(currentDbType, base);
            dd.source = opts;
            dd.type = 'autocomplete';
            (dd as Handsontable.CellMeta & { strict?: boolean }).strict = true;
            (dd as Handsontable.CellMeta & { filter?: boolean }).filter = false;
            dd.allowInvalid = false;
            dd.readOnly = false;
          } else if (prop === 'onUpdate') {
            // Check if defaultKind is uuid, if so, disable onUpdate
            const defaultKind = normalizeDefaultKind(
              currentRows[row]?.defaultKind as UiDefaultKind,
            );
            if (defaultKind === 'uuid') {
              dd.type = 'text';
              dd.readOnly = true;
              dd.allowInvalid = false;
              dd.source = undefined;
              dd.className = `${
                dd.className ? dd.className + ' ' : ''
              }htDimmed`;
            } else {
              const opts = getUiOnUpdateOptions(currentDbType, base);
              if (opts.length <= 1) {
                dd.type = 'text';
                dd.readOnly = true;
                dd.allowInvalid = false;
                dd.source = undefined;
              } else {
                dd.source = opts;
                dd.type = 'autocomplete';
                (dd as Handsontable.CellMeta & { strict?: boolean }).strict =
                  true;
                (dd as Handsontable.CellMeta & { filter?: boolean }).filter =
                  false;
                dd.allowInvalid = false;
                dd.readOnly = false;
              }
            }
          }
        }

        return cellProps;
      },
      [],
    );

    const handleBeforeChange = useCallback(
      (changes: (Handsontable.CellChange | null)[] | null, _source: string) => {
        if (!changes) return;
        changes.forEach((change) => {
          if (!change) return;
          const [, prop, , nextValue] = change;
          if (prop !== 'nullable' || typeof nextValue !== 'string') return;
          const normalized = nextValue.trim().toLowerCase();
          if (normalized === 'y') {
            change[3] = '是';
          } else if (normalized === 'n') {
            change[3] = '否';
          }
        });
      },
      [],
    );

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

    const handleAddRowsClick = useCallback(() => {
      onAddRows(safeAddCount);
    }, [onAddRows, safeAddCount]);

    // Apply row-level highlight animation
    useEffect(() => {
      if (highlightedRowIndex == null || highlightedRowIndex < 0) return;

      const hot = hotRef.current?.hotInstance;
      if (!hot) return;

      const colCount = COLUMN_HEADERS.length;
      const currentRow = highlightedRowIndex;

      // Add highlight class to all cells in the row
      for (let col = 0; col < colCount; col++) {
        const existingClass = hot.getCellMeta(currentRow, col).className || '';
        // Avoid duplicate classes
        if (!existingClass.includes('ht-row-highlight')) {
          hot.setCellMeta(
            currentRow,
            col,
            'className',
            `${existingClass} ht-row-highlight`.trim(),
          );
        }
      }
      hot.render();

      // Remove highlight after animation duration
      const timeout = setTimeout(() => {
        const hotInstance = hotRef.current?.hotInstance;
        if (!hotInstance) return;

        for (let col = 0; col < colCount; col++) {
          const existingClass =
            hotInstance.getCellMeta(currentRow, col).className || '';
          hotInstance.setCellMeta(
            currentRow,
            col,
            'className',
            existingClass.replace(/\s*ht-row-highlight\s*/g, ' ').trim(),
          );
        }
        hotInstance.render();
      }, 1200);

      return () => clearTimeout(timeout);
    }, [highlightedRowIndex]);

    return (
      <div
        className={cn(
          'relative min-h-[420px] flex-1 rounded-lg border bg-card/95 backdrop-blur-sm shadow-lg shadow-primary/5 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-0.5',
          isHighlighted && 'animate-field-highlight',
        )}
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
            {/* 左侧工具栏插槽 */}
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

            {/* 右侧添加行按钮 */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-md px-3 py-1.5">
                <Label
                  htmlFor="field-freeze-switch"
                  className="text-sm text-muted-foreground"
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
                  type="number"
                  min={1}
                  max={COLUMN_HEADERS.length}
                  step={1}
                  value={effectiveFreezeColumns}
                  disabled={!freezeEnabled}
                  onChange={(e) => {
                    const parsed = Math.floor(Number(e.target.value));
                    onFreezeColumnsChange(
                      Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                    );
                  }}
                  className="w-20 transition-all duration-200 focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <span className="text-sm text-muted-foreground">列</span>
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
        <div className="relative p-4">
          <HotTable
            ref={hotRef}
            data={rows}
            columns={columns}
            colHeaders={COLUMN_HEADERS}
            fixedColumnsStart={freezeEnabled ? effectiveFreezeColumns : 0}
            rowHeaders={false}
            stretchH="all"
            width="100%"
            height="auto"
            licenseKey="non-commercial-and-evaluation"
            manualColumnResize
            visibleRows={6}
            contextMenu
            beforeChange={handleBeforeChange}
            cells={cells}
            afterChange={onRowsChange}
            afterCreateRow={onCreateRow}
            afterRemoveRow={onRemoveRow}
            themeName="ht-theme-main"
            className="h-full w-full"
          />
        </div>
      </div>
    );
  },
);
