import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import type Handsontable from "handsontable";
import { registerAllModules } from "handsontable/registry";
import { HotTable } from "@handsontable/react-wrapper";
import "handsontable/dist/handsontable.full.css";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Database,
  Server,
  Archive,
  ChevronUp,
  ChevronDown,
  X,
  Trash2,
} from "lucide-react";
import { ChangelogModal } from "@/components/ChangelogModal";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Import refactored utilities
import type {
  DatabaseType,
  FieldRow,
  NormalizedField,
  IndexField,
  IndexDefinition,
  UiDefaultKind,
  UiOnUpdate
} from "./types";
import {
  DATABASE_OPTIONS,
  YES_VALUES,
  DEFAULT_KIND_OPTIONS,
  ON_UPDATE_OPTIONS,
  COLUMN_HEADERS,
  STORAGE_KEY
} from "./utils/constants";
import {
  toStringSafe,
  isReservedKeyword,
  normalizeBoolean,
  normalizeDefaultKind,
  normalizeOnUpdate,
  createEmptyRow,
  ensureOrder,
  normalizeFields,
  sanitizeRowsForPersist,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
} from "./utils/helpers";
import {
  getFieldTypeForDatabase,
  parseFieldType,
  getCanonicalBaseType
} from "./utils/databaseTypeMapping";
import {
  buildDDL,
  buildDCL
} from "./utils/ddlGenerators";
import { sanitizeIndexesForPersist } from "./utils/indexUtils";

// Import custom hooks
import {
  useToast,
  usePersistedState,
  useTableData,
  useIndexManagement,
  useAuthManagement,
  useSqlGeneration,
  useCollapseState,
} from "./hooks";

registerAllModules();

// Import reserved keywords for validation
import { RESERVED_KEYWORDS } from "./utils/constants";

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
    source: DEFAULT_KIND_OPTIONS as unknown as string[],
    allowInvalid: false,
  },
  { data: "defaultValue", type: "text" },
  {
    data: "onUpdate",
    type: "dropdown",
    source: ON_UPDATE_OPTIONS as unknown as string[],
    allowInvalid: false,
  },
];

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) =>
  createEmptyRow(index)
);

function App() {
  const [tableName, setTableName] = useState("");
  const [tableComment, setTableComment] = useState("");
  const [dbType, setDbType] = useState<DatabaseType>("mysql");
  const [addCount, setAddCount] = useState<number>(10);

  // Changelog modal state
  const [showChangelog, setShowChangelog] = useState(false);

  // Use custom hooks
  const { toastMessage, showToast } = useToast();
  const { persistedState, hydrated, saveState, clearState } = usePersistedState();

  const {
    rows,
    duplicateNameSet,
    normalizedFields,
    handleRowsChange,
    handleCreateRow,
    handleRemoveRow,
    handleAddRows,
  } = useTableData(INITIAL_ROWS, persistedState?.rows);

  const availableFields = normalizedFields
    .map((field) => field.name)
    .filter((name) => name.length > 0);

  const {
    indexInput,
    currentIndexFields,
    indexes,
    fieldSuggestions,
    showFieldSuggestions,
    selectedSuggestionIndex,
    setIndexInput,
    setShowFieldSuggestions,
    setSelectedSuggestionIndex,
    addFieldToIndex,
    removeFieldFromIndex,
    toggleFieldDirection,
    addIndex,
    removeIndex,
  } = useIndexManagement(tableName, availableFields, persistedState);

  const {
    authInput,
    authObjects,
    setAuthInput,
    addAuthObject,
    removeAuthObject,
  } = useAuthManagement(persistedState);

  const {
    isIndexCollapsed,
    isAuthCollapsed,
    toggleIndexCollapse,
    toggleAuthCollapse,
  } = useCollapseState();

  const {
    generatedSql,
    generatedDcl,
    copySql,
    copyDcl,
  } = useSqlGeneration(
    dbType,
    tableName,
    tableComment,
    normalizedFields,
    indexes,
    authObjects,
    showToast
  );

  // restore basic state from localStorage once on mount
  useEffect(() => {
    if (!hydrated || !persistedState) return;

    if (typeof persistedState.tableName === "string")
      setTableName(persistedState.tableName);
    if (typeof persistedState.tableComment === "string")
      setTableComment(persistedState.tableComment);
    if (
      persistedState.dbType === "mysql" ||
      persistedState.dbType === "postgresql" ||
      persistedState.dbType === "sqlserver" ||
      persistedState.dbType === "oracle"
    ) {
      setDbType(persistedState.dbType);
    }
    if (
      typeof persistedState.addCount === "number" &&
      Number.isFinite(persistedState.addCount)
    ) {
      setAddCount(Math.max(1, Math.floor(persistedState.addCount)));
    }
  }, [hydrated, persistedState]);

  // save to localStorage on changes
  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: PersistedState = {
        tableName,
        tableComment,
        dbType,
        rows: sanitizeRowsForPersist(rows),
        addCount,
        indexInput,
        currentIndexFields,
        indexes: sanitizeIndexesForPersist(indexes),
        authInput,
        authObjects,
      };
      saveState(payload);
    } catch {
      // ignore quota errors
    }
  }, [
    hydrated,
    tableName,
    tableComment,
    dbType,
    rows,
    addCount,
    indexInput,
    currentIndexFields,
    indexes,
    authInput,
    authObjects,
    saveState,
  ]);
  
  
  
  
  
  const handleClearAll = useCallback(() => {
    if (!window.confirm("确定要清除所有配置吗？此操作不可撤销。")) return;

    // Clear all state variables
    setTableName("");
    setTableComment("");
    setDbType("mysql");
    setAddCount(10);
    setIndexInput("");
    setAuthInput("");

    // Clear localStorage
    clearState();

    showToast("所有配置已清除");
  }, [showToast, clearState]);

  const basePlain = (vs as Record<string, unknown>).plain as
    | Record<string, unknown>
    | undefined;
  const customTheme = {
    ...vs,
    plain: {
      ...(basePlain ?? {}),
      color: "#000",
      backgroundColor: "transparent",
    },
  };

  return (
    <div className="min-h-screen bg-background text-sm text-foreground">
      {/* Header Banner */}
      <header className="border-b bg-card shadow-sm">
        <div className="px-4 py-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/favicon.png"
                alt="筑表师 Logo"
                className="h-10 w-10 rounded"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">筑表师</h1>
                <p className="text-sm text-muted-foreground">
                  专业的数据库建表工具
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground mb-1">
                v{import.meta.env.VITE_APP_VERSION || "0.0.5"}
              </div>
              <button
                onClick={() => setShowChangelog(true)}
                className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
              >
                更新日志
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-col gap-4 p-4 lg:flex-row">
        <div className="flex flex-1 flex-col gap-4">
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-base font-semibold">表信息配置</h2>
                <p className="text-xs text-muted-foreground">
                  配置表名、注释和数据库类型
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1"
                onClick={handleClearAll}
              >
                <Trash2 className="h-4 w-4" /> 清空所有
              </Button>
            </div>
            <div className="p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="table-name">表名</Label>
                  <Input
                    id="table-name"
                    placeholder="例如: order_info"
                    value={tableName}
                    onChange={(event) => setTableName(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="table-comment">表中文名</Label>
                  <Input
                    id="table-comment"
                    placeholder="例如: 订单信息表"
                    value={tableComment}
                    onChange={(event) => setTableComment(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>数据库类型</Label>
                  <Select
                    value={dbType}
                    onValueChange={(value) => setDbType(value as DatabaseType)}
                  >
                    <SelectTrigger>
                      <SelectValue>
                        {(() => {
                          const selectedOption = DATABASE_OPTIONS.find(
                            (option) => option.value === dbType
                          );
                          if (!selectedOption) return "请选择数据库类型";
                          const Icon = selectedOption.icon;
                          return (
                            <div className="flex items-center gap-2">
                              <Icon
                                className={`h-4 w-4 ${
                                  selectedOption.value === "mysql"
                                    ? "text-blue-600"
                                    : selectedOption.value === "postgresql"
                                    ? "text-blue-800"
                                    : selectedOption.value === "sqlserver"
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              />
                              <span>{selectedOption.label}</span>
                            </div>
                          );
                        })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {DATABASE_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        return (
                          <SelectItem key={option.value} value={option.value}>
                            <div className="flex items-center gap-2">
                              <Icon
                                className={`h-4 w-4 ${
                                  option.value === "mysql"
                                    ? "text-blue-600"
                                    : option.value === "postgresql"
                                    ? "text-blue-800"
                                    : option.value === "sqlserver"
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              />
                              <span>{option.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* Index Configuration Area */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={toggleIndexCollapse}
            >
              <Label className="text-base font-medium cursor-pointer">
                索引配置
              </Label>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  isIndexCollapsed ? "rotate-180" : ""
                }`}
              />
            </div>

            {!isIndexCollapsed && (
              <div className="px-4 pb-4">
                <div className="space-y-3">
                  {/* Field Input */}
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          placeholder="输入字段名进行匹配..."
                          value={indexInput}
                          onChange={(e) => {
                            setIndexInput(e.target.value);
                            setShowFieldSuggestions(
                              e.target.value.trim().length > 0
                            );
                            setSelectedSuggestionIndex(0);
                          }}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              fieldSuggestions.length > 0
                            ) {
                              e.preventDefault();
                              addFieldToIndex(
                                fieldSuggestions[selectedSuggestionIndex]
                              );
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setSelectedSuggestionIndex((prev) =>
                                prev < fieldSuggestions.length - 1
                                  ? prev + 1
                                  : prev
                              );
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setSelectedSuggestionIndex((prev) =>
                                prev > 0 ? prev - 1 : 0
                              );
                            } else if (e.key === "Escape") {
                              setShowFieldSuggestions(false);
                            } else if (
                              e.key === "Backspace" &&
                              indexInput === "" &&
                              currentIndexFields.length > 0
                            ) {
                              e.preventDefault();
                              removeFieldFromIndex(
                                currentIndexFields.length - 1
                              );
                            }
                          }}
                          className="pr-20"
                        />
                        {currentIndexFields.length > 0 && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => addIndex(false)}
                            >
                              添加索引
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => addIndex(true)}
                            >
                              添加唯一索引
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className={`h-6 px-2 text-xs ${
                                indexes.some((index) => index.isPrimary)
                                  ? "cursor-not-allowed opacity-50"
                                  : ""
                              }`}
                              onClick={() => addIndex(true, true)}
                              disabled={indexes.some(
                                (index) => index.isPrimary
                              )}
                            >
                              添加主键
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Field Suggestions Dropdown */}
                    {showFieldSuggestions && fieldSuggestions.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-lg">
                        <div className="max-h-32 overflow-auto p-1">
                          {fieldSuggestions.map((field, index) => (
                            <div
                              key={field}
                              className={`flex cursor-pointer items-center rounded-sm px-3 py-2 text-sm hover:bg-accent ${
                                index === selectedSuggestionIndex
                                  ? "bg-accent"
                                  : ""
                              }`}
                              onClick={() => addFieldToIndex(field)}
                              onMouseEnter={() =>
                                setSelectedSuggestionIndex(index)
                              }
                            >
                              {field}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Selected Fields as Labels */}
                  {currentIndexFields.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {currentIndexFields.map((field, index) => (
                        <div
                          key={index}
                          className="group flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-sm"
                          onClick={() => toggleFieldDirection(index)}
                        >
                          <span className="cursor-pointer">{field.name}</span>
                          {field.direction === "ASC" ? (
                            <ChevronUp className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFieldFromIndex(index);
                            }}
                            className="ml-1 rounded-full p-0.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Added Indexes */}
                  {indexes.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">已添加的索引</div>
                      <div className="space-y-1">
                        {indexes.map((index) => (
                          <div
                            key={index.id}
                            className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {index.name}
                              </span>
                              {index.isPrimary && (
                                <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800 font-medium">
                                  主键
                                </span>
                              )}
                              {index.unique && !index.isPrimary && (
                                <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800">
                                  唯一
                                </span>
                              )}
                              <span className="text-xs text-muted-foreground">
                                (
                                {index.fields
                                  .map(
                                    (f) =>
                                      `${f.name}${
                                        f.direction === "DESC" ? " DESC" : ""
                                      }`
                                  )
                                  .join(", ")}
                                )
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => removeIndex(index.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Authorization Objects Configuration Area */}
          <div className="rounded-lg border bg-card shadow-sm">
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={toggleAuthCollapse}
            >
              <Label className="text-base font-medium cursor-pointer">
                授权对象配置
              </Label>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  isAuthCollapsed ? "rotate-180" : ""
                }`}
              />
            </div>

            {!isAuthCollapsed && (
              <div className="px-4 pb-4">
                <div className="space-y-3">
                  {/* Authorization Object Input */}
                  <div className="relative">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          placeholder="输入授权对象名称..."
                          value={authInput}
                          onChange={(e) => {
                            setAuthInput(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && authInput.trim()) {
                              e.preventDefault();
                              addAuthObject(authInput.trim());
                            } else if (
                              e.key === "Backspace" &&
                              authInput === "" &&
                              authObjects.length > 0
                            ) {
                              e.preventDefault();
                              removeAuthObject(authObjects.length - 1);
                            }
                          }}
                          className="pr-20"
                        />
                        {authInput.trim() && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-xs"
                              onClick={() => addAuthObject(authInput.trim())}
                            >
                              添加
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Added Authorization Objects */}
                  {authObjects.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        已添加的授权对象
                      </div>
                      <div className="space-y-1">
                        {authObjects.map((authObj, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {authObj}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => removeAuthObject(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="min-h-[420px] flex-1 rounded-lg border bg-card p-2 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Button size="sm" onClick={handleAddRows}>
                添加行
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={addCount}
                  onChange={(e) =>
                    setAddCount(Math.floor(Number(e.target.value)))
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
              cells={(row: number, _col: number, prop?: string | number) => {
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
                    (
                      dd as Handsontable.CellMeta & { strict?: boolean }
                    ).strict = true;
                    (
                      dd as Handsontable.CellMeta & { filter?: boolean }
                    ).filter = false;
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
                        (
                          dd as Handsontable.CellMeta & { strict?: boolean }
                        ).strict = true;
                        (
                          dd as Handsontable.CellMeta & { filter?: boolean }
                        ).filter = false;
                        dd.allowInvalid = false;
                        dd.readOnly = false;
                      }
                    }
                  }
                }
                return cellProps;
              }}
              afterChange={handleRowsChange}
              afterCreateRow={handleCreateRow}
              afterRemoveRow={handleRemoveRow}
              className="h-full w-full"
            />
          </div>
        </div>
        <div className="flex w-full flex-col rounded-lg border bg-card shadow-sm lg:max-w-xl">
          {/* Upper Section - DDL Output */}
          <div className="flex flex-1 flex-col border-b">
            <div className="border-b px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">建表 DDL</h2>
                  <p className="text-xs text-muted-foreground">
                    根据左侧输入实时生成不同数据库的建表语句
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  onClick={copySql}
                >
                  <Copy className="h-4 w-4" /> 复制DDL
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-4 py-4">
              <SyntaxHighlighter
                language="sql"
                style={customTheme}
                customStyle={{
                  background: "transparent",
                  margin: 0,
                  padding: 0,
                  fontSize: "1rem",
                }}
                lineNumberStyle={{ color: "#000" }}
                showLineNumbers
              >
                {generatedSql || "-- 请在左侧填写表信息"}
              </SyntaxHighlighter>
            </div>
          </div>

          {/* Lower Section - DCL Output */}
          <div className="flex flex-1 flex-col">
            <div className="border-b px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">授权 DCL</h2>
                  <p className="text-xs text-muted-foreground">
                    生成数据库授权语句（GRANT）
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-1"
                  onClick={copyDcl}
                >
                  <Copy className="h-4 w-4" /> 复制DCL
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto px-4 py-4">
              <SyntaxHighlighter
                language="sql"
                style={customTheme}
                customStyle={{
                  background: "transparent",
                  margin: 0,
                  padding: 0,
                  fontSize: "1rem",
                }}
                lineNumberStyle={{ color: "#000" }}
                showLineNumbers
              >
                {generatedDcl || "-- 请在下方配置授权对象"}
              </SyntaxHighlighter>
            </div>
          </div>
        </div>
      </div>
      {toastMessage && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-black/90 px-3 py-2 text-xs text-white shadow-md">
          {toastMessage}
        </div>
      )}

      <ChangelogModal open={showChangelog} onOpenChange={setShowChangelog} />
    </div>
  );
}

// 重新导出工具函数供外部使用
export {
  parseFieldType,
  getFieldTypeForDatabase,
  getCanonicalBaseType,
} from "./utils/databaseTypeMapping";

export {
  buildDDL,
  buildDCL,
} from "./utils/ddlGenerators";

export {
  normalizeFields,
  isReservedKeyword,
  toStringSafe,
} from "./utils/helpers";

export {
  buildMysqlDDL,
  buildPostgresDDL,
  buildSqlServerDDL,
  buildOracleDDL,
  buildOracleSynonyms,
  escapeSingleQuotes,
  formatConstantDefault,
  shouldQuoteDefault,
  isLikelyFunctionOrKeyword,
  splitQualifiedName,
  getSchemaAndTable,
  formatMysqlTableName,
  formatPostgresTableName,
} from "./utils/ddlGenerators";

export {
  normalizeBoolean,
  normalizeDefaultKind,
  normalizeOnUpdate,
  createEmptyRow,
  ensureOrder,
  sanitizeRowsForPersist,
  getUiDefaultKindOptions,
  getUiOnUpdateOptions,
  isIntegerType,
  isCharacterType,
  supportsUuidDefault,
  supportsAutoIncrement,
  supportsDefaultCurrentTimestamp,
  supportsOnUpdateCurrentTimestamp,
} from "./utils/helpers";

export {
  sanitizeIndexesForPersist,
} from "./utils/indexUtils";

export {
  DATABASE_OPTIONS,
  YES_VALUES,
  DEFAULT_KIND_OPTIONS,
  ON_UPDATE_OPTIONS,
  COLUMN_HEADERS,
  STORAGE_KEY,
  RESERVED_KEYWORDS,
} from "./utils/constants";

export {
  TYPE_ALIASES,
  canonicalizeBaseType,
  mapTypeForMysql,
  mapTypeForPostgres,
  mapTypeForSqlServer,
  mapTypeForOracle,
} from "./utils/databaseTypeMapping";

export type {
  DatabaseType,
  FieldRow,
  NormalizedField,
  IndexField,
  IndexDefinition,
  UiDefaultKind,
  UiOnUpdate,
  ParsedFieldType,
  PersistedState,
} from "./types";

export default App;
