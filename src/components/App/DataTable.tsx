import React from "react";
import { memo, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Columns3Cog } from "lucide-react";
import { registerAllModules } from "handsontable/registry";
import { HotTable } from "@handsontable/react-wrapper";
import "handsontable/styles/handsontable.css";
import "handsontable/styles/ht-theme-main.css";
import type Handsontable from "handsontable";
import type { FieldRow, UiDefaultKind, DatabaseType } from "@/types";
import {
  toStringSafe,
  isReservedKeyword,
  normalizeDefaultKind,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
} from "@/utils/helpers";
import {
  getCanonicalBaseType,
} from "@/utils/databaseTypeMapping";
import { COLUMN_HEADERS } from "@/utils/constants";

registerAllModules();

const COLUMN_SETTINGS: Handsontable.ColumnSettings[] = [
  { data: "order", readOnly: true, width: 48, className: "htCenter" },
  { data: "fieldName", type: "text" },
  { data: "fieldComment", type: "text" },
  { data: "fieldType", type: "text" },
  {
    data: "nullable",
    type: "checkbox",
    className: "htCenter",
    checkedTemplate: "是",
    uncheckedTemplate: "否",
  },
  {
    data: "defaultKind",
    type: "dropdown",
    source: [],
    allowInvalid: false,
  },
  { data: "defaultValue", type: "text" },
  {
    data: "onUpdate",
    type: "dropdown",
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
}

export const DataTable = memo<DataTableProps>(({
  rows,
  duplicateNameSet,
  dbType,
  addCount,
  onRowsChange,
  onCreateRow,
  onRemoveRow,
  onAddRows,
  onAddCountChange,
}) => {
  const rowWarnings = useMemo(() => {
    return rows.map((row) => {
      const warnings: string[] = [];
      const name = toStringSafe(row?.fieldName).trim();
      if (!name)
        return warnings;
      if (duplicateNameSet.has(name))
        warnings.push("字段名重复");
      if (isReservedKeyword(dbType, name))
        warnings.push("字段名为数据库保留关键字");
      return warnings;
    });
  }, [rows, duplicateNameSet, dbType]);

  const columns = useMemo<Handsontable.ColumnSettings[]>(() => {
    return COLUMN_SETTINGS.map((col) => {
      if (col.data !== "order")
        return col;
      return {
        ...col,
        renderer: (instance, td, row, colIndex, prop, value, cellProperties) => {
          while (td.firstChild)
            td.removeChild(td.firstChild);
          td.classList.add("htOrderCell");
          const wrapper = document.createElement("span");
          wrapper.className = "htOrderCellInner";
          const label = document.createElement("span");
          label.className = "htOrderValue";
          label.textContent = value == null ? "" : String(value);
          wrapper.appendChild(label);
          const warnings = rowWarnings[row];
          if (warnings?.length) {
            td.classList.add("htOrderHasWarning");
            const icon = document.createElement("span");
            icon.className = "htOrderWarningIcon";
            const tooltip = warnings.join("，");
            icon.setAttribute("title", tooltip);
            icon.setAttribute("aria-label", tooltip);
            icon.textContent = "!";
            wrapper.appendChild(icon);
          } else {
            td.classList.remove("htOrderHasWarning");
          }
          td.appendChild(wrapper);
        },
      };
    });
  }, [rowWarnings]);

  // Enhanced cells function extracted from App.tsx
  const cells = useCallback((row: number, _col: number, prop?: string | number) => {
    const cellProps: Handsontable.CellMeta = {};

    if (prop === "defaultValue") {
      const kind = normalizeDefaultKind(
        rows[row]?.defaultKind as UiDefaultKind
      );
      if (kind !== "constant") {
        cellProps.readOnly = true;
        cellProps.type = "text";
        cellProps.className = `${
          cellProps.className ? cellProps.className + " " : ""
        }htDimmed`;
      }
    }

    if (prop === "defaultKind" || prop === "onUpdate") {
      const base = getCanonicalBaseType(
        toStringSafe(rows[row]?.fieldType)
      );
      const dd = cellProps as Handsontable.CellMeta & {
        source?: string[];
      };

      if (prop === "defaultKind") {
        const opts = getUiDefaultKindOptions(dbType, base);
        dd.source = opts;
        dd.type = "autocomplete";
        (dd as Handsontable.CellMeta & { strict?: boolean }).strict = true;
        (dd as Handsontable.CellMeta & { filter?: boolean }).filter = false;
        dd.allowInvalid = false;
        dd.readOnly = false;
      } else if (prop === "onUpdate") {
        // Check if defaultKind is uuid, if so, disable onUpdate
        const defaultKind = normalizeDefaultKind(
          rows[row]?.defaultKind as UiDefaultKind
        );
        if (defaultKind === "uuid") {
          dd.type = "text";
          dd.readOnly = true;
          dd.allowInvalid = false;
          dd.source = undefined;
          dd.className = `${
            dd.className ? dd.className + " " : ""
          }htDimmed`;
        } else {
          const opts = getUiOnUpdateOptions(dbType, base);
          if (opts.length <= 1) {
            dd.type = "text";
            dd.readOnly = true;
            dd.allowInvalid = false;
            dd.source = undefined;
          } else {
            dd.source = opts;
            dd.type = "autocomplete";
            (dd as Handsontable.CellMeta & { strict?: boolean }).strict = true;
            (dd as Handsontable.CellMeta & { filter?: boolean }).filter = false;
            dd.allowInvalid = false;
            dd.readOnly = false;
          }
        }
      }
    }

    return cellProps;
  }, [rows, dbType]);

  const handleBeforeChange = useCallback((changes: Handsontable.CellChange[] | null) => {
    if (!changes)
      return;
    changes.forEach((change) => {
      if (!change)
        return;
      const [, prop, , nextValue] = change;
      if (prop !== "nullable" || typeof nextValue !== "string")
        return;
      const normalized = nextValue.trim().toLowerCase();
      if (normalized === "y") {
        change[3] = "是";
      } else if (normalized === "n") {
        change[3] = "否";
      }
    });
  }, []);

  const safeAddCount = Number.isFinite(addCount) && addCount > 0 ? Math.floor(addCount) : 1;

  const handleAddRowsClick = useCallback(() => {
    onAddRows(safeAddCount);
  }, [onAddRows, safeAddCount]);

  return (
    <div className="min-h-[420px] flex-1 rounded-lg border bg-card p-6 shadow-sm">
      <div className="border-b pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-base font-semibold text-primary">
            <Columns3Cog className="h-4 w-4" />
            字段配置
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleAddRowsClick}>
              添加行
            </Button>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                step={1}
                value={safeAddCount}
                onChange={(e) => {
                  const parsed = Math.floor(Number(e.target.value));
                  onAddCountChange(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
                }}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground">行数</span>
            </div>
          </div>
        </div>
      </div>
      <div className="pt-4">
        <HotTable
          data={rows}
          columns={columns}
          colHeaders={COLUMN_HEADERS}
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
});
