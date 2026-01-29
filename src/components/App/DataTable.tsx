import { memo, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GripVertical } from 'lucide-react';
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
import { ManualRowMove } from 'handsontable/plugins/manualRowMove';
import { StretchColumns } from 'handsontable/plugins/stretchColumns';
import { UndoRedo } from 'handsontable/plugins/undoRedo';
import { HotTable } from '@handsontable/react-wrapper';
import 'handsontable/styles/handsontable.css';
import 'handsontable/styles/ht-theme-main.css';
import type Handsontable from 'handsontable';
import type { FieldRow, UiDefaultKind, DatabaseType } from '@/types';
import {
  toStringSafe,
  isReservedKeyword,
  normalizeDefaultKind,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
} from '@/utils/helpers';
import { getCanonicalBaseType } from '@/utils/databaseTypeMapping';
import { COLUMN_HEADERS } from '@/utils/constants';

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
  registerPlugin(ManualRowMove);
  registerPlugin(StretchColumns);
  registerPlugin(UndoRedo);
  handsontableModulesRegistered = true;
};

ensureHandsontableModules();

const COLUMN_SETTINGS: Handsontable.ColumnSettings[] = [
  { data: 'order', readOnly: true, width: 40, className: 'htCenter' },
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
  rows: FieldRow[];
  duplicateNameSet: Set<string>;
  dbType: DatabaseType;
  addCount: number;
  onRowsChange: (changes: any[] | null, source: string) => void;
  onCreateRow: (index: number, amount: number) => void;
  onRemoveRow: (index: number, amount: number) => void;
  onAddRows: (count: number) => void;
  onAddCountChange: (value: number) => void;
  onRowMove?: (from: number, to: number) => void;
}

export const DataTable = memo<DataTableProps>(
  ({
    rows,
    duplicateNameSet,
    dbType,
    addCount,
    onRowsChange,
    onCreateRow,
    onRemoveRow,
    onAddRows,
    onAddCountChange,
    onRowMove,
  }) => {
    const latestRef = useRef({ rows, dbType });
    const hotTableRef = useRef<Handsontable | null>(null);
    latestRef.current = { rows, dbType };

    const rowWarnings = useMemo(() => {
      return rows.map((row) => {
        const warnings: string[] = [];
        const name = toStringSafe(row?.fieldName).trim();
        if (!name) return warnings;
        if (duplicateNameSet.has(name)) warnings.push('字段名重复');
        if (isReservedKeyword(dbType, name)) warnings.push('保留关键字');
        return warnings;
      });
    }, [rows, duplicateNameSet, dbType]);

    const columns = useMemo<Handsontable.ColumnSettings[]>(() => {
      return COLUMN_SETTINGS.map((col) => {
        if (col.data !== 'order') return col;
        return {
          ...col,
          renderer: (_instance, td, row, _col, _prop, value) => {
            while (td.firstChild) td.removeChild(td.firstChild);
            td.classList.add('htOrderCell');
            const wrapper = document.createElement('span');
            wrapper.className = 'htOrderCellInner';

            // Drag handle
            const dragHandle = document.createElement('span');
            dragHandle.className = 'htDragHandle';
            dragHandle.innerHTML = '⋮⋮';
            dragHandle.style.cssText =
              'font-size: 10px; letter-spacing: -2px; margin-right: 4px; color: hsl(var(--muted-foreground));';
            wrapper.appendChild(dragHandle);

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
      (changes: Handsontable.CellChange[] | null) => {
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

    const handleAfterRowMove = useCallback(
      (movedRows: number[], finalIndex: number) => {
        if (!onRowMove || movedRows.length === 0) return;
        const from = movedRows[0];
        const to = finalIndex;
        onRowMove(from, to);
      },
      [onRowMove],
    );

    const safeAddCount =
      Number.isFinite(addCount) && addCount > 0 ? Math.floor(addCount) : 1;

    const handleAddRowsClick = useCallback(() => {
      onAddRows(safeAddCount);
    }, [onAddRows, safeAddCount]);

    return (
      <div className="rounded-lg border bg-card shadow-sm">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GripVertical className="h-3.5 w-3.5" />
            <span>拖拽行号可调整字段顺序</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
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
                className="h-7 w-16 text-sm"
              />
              <Button
                onClick={handleAddRowsClick}
                size="sm"
                className="h-7 text-xs"
              >
                添加行
              </Button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="p-4">
          <HotTable
            ref={hotTableRef as any}
            data={rows}
            columns={columns}
            colHeaders={COLUMN_HEADERS}
            rowHeaders={false}
            stretchH="all"
            width="100%"
            height="auto"
            licenseKey="non-commercial-and-evaluation"
            manualColumnResize
            manualRowMove
            visibleRows={8}
            contextMenu
            beforeChange={handleBeforeChange}
            cells={cells}
            afterChange={onRowsChange}
            afterCreateRow={onCreateRow}
            afterRemoveRow={onRemoveRow}
            afterRowMove={handleAfterRowMove}
            themeName="ht-theme-main"
            className="h-full w-full"
          />
        </div>
      </div>
    );
  },
);
