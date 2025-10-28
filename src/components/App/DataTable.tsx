import React from "react";
import { memo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerAllModules } from "handsontable/registry";
import { HotTable } from "@handsontable/react-wrapper";
import "handsontable/dist/handsontable.full.css";
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
  onAddRows: () => void;
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
  // Enhanced cells function extracted from App.tsx
  const cells = useCallback((row: number, _col: number, prop?: string | number) => {
    const cellProps: Handsontable.CellMeta = {};

    if (prop === "fieldName") {
      const name = toStringSafe(rows[row]?.fieldName).trim();
      const classes: string[] = [];
      if (name && duplicateNameSet.has(name))
        classes.push("htDuplicateFieldName");
      if (name && isReservedKeyword(dbType, name))
        classes.push("htReservedKeyword");
      if (classes.length)
        cellProps.className = `${
          cellProps.className ? cellProps.className + " " : ""
        }${classes.join(" ")}`;
    }

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
  }, [rows, duplicateNameSet, dbType]);

  return (
    <div className="min-h-[420px] flex-1 rounded-lg border bg-card p-2 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Button size="sm" onClick={onAddRows}>
          添加行
        </Button>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            step={1}
            value={addCount}
            onChange={(e) =>
              onAddCountChange(Math.floor(Number(e.target.value)))
            }
            className="w-20"
          />
          <span className="text-xs text-muted-foreground">行数</span>
        </div>
      </div>
      <HotTable
        data={rows}
        columns={COLUMN_SETTINGS}
        colHeaders={COLUMN_HEADERS}
        rowHeaders={false}
        stretchH="all"
        width="100%"
        height="auto"
        licenseKey="non-commercial-and-evaluation"
        manualColumnResize
        visibleRows={6}
        contextMenu
        cells={cells}
        afterChange={onRowsChange}
        afterCreateRow={onCreateRow}
        afterRemoveRow={onRemoveRow}
        className="h-full w-full"
      />
    </div>
  );
});