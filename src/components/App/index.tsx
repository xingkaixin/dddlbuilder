import { useCallback, useEffect, useState } from "react";
import type { DatabaseType, FieldRow, NormalizedField } from "@/types";
import { createEmptyRow } from "@/utils/helpers";
import { Header } from "./Header";
import { TableConfig } from "./TableConfig";
import { IndexPanel } from "./IndexPanel";
import { AuthPanel } from "./AuthPanel";
import { DataTable } from "./DataTable";
import { DDLOutput } from "./DDLOutput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usePersistedState,
  useTableData,
  useIndexManagement,
  useAuthManagement,
  useSqlGeneration,
  useCollapseState,
} from "@/hooks";
import { sanitizeIndexesForPersist } from "@/utils/indexUtils";

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) =>
  createEmptyRow(index)
);

function App() {
  // Basic state
  const [tableName, setTableName] = useState("");
  const [tableComment, setTableComment] = useState("");
  const [dbType, setDbType] = useState<DatabaseType>("mysql");
  const [addCount, setAddCount] = useState<number>(10);

  // Changelog modal state
  const [showChangelog, setShowChangelog] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

  // Use custom hooks
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
    authObjects
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
      const payload = {
        tableName,
        tableComment,
        dbType,
        rows: rows.map(row => ({
          ...row,
          // Ensure all required fields are present
          order: row.order || 0,
          fieldName: row.fieldName || "",
          fieldComment: row.fieldComment || "",
          fieldType: row.fieldType || "",
          nullable: row.nullable || false,
          defaultKind: row.defaultKind || "",
          defaultValue: row.defaultValue || "",
          onUpdate: row.onUpdate || "",
        })),
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
    setIsClearDialogOpen(true);
  }, []);

  const cancelClearAll = useCallback(() => {
    setIsClearDialogOpen(false);
  }, []);

  const confirmClearAll = useCallback(() => {
    setTableName("");
    setTableComment("");
    setDbType("mysql");
    setAddCount(10);
    setIndexInput("");
    setAuthInput("");

    // Clear localStorage
    clearState();

    cancelClearAll();
  }, [cancelClearAll, clearState, setIndexInput, setAuthInput]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        showChangelog={showChangelog}
        setShowChangelog={setShowChangelog}
      />

      {/* Main Content */}
      <div className="flex flex-col gap-6 p-6 lg:flex-row">
        <div className="flex flex-1 flex-col gap-6">
          <TableConfig
            tableName={tableName}
            tableComment={tableComment}
            dbType={dbType}
            onTableNameChange={setTableName}
            onTableCommentChange={setTableComment}
            onDbTypeChange={setDbType}
            onClearAll={handleClearAll}
          />

          <IndexPanel
            isIndexCollapsed={isIndexCollapsed}
            indexInput={indexInput}
            currentIndexFields={currentIndexFields}
            indexes={indexes}
            fieldSuggestions={fieldSuggestions}
            showFieldSuggestions={showFieldSuggestions}
            selectedSuggestionIndex={selectedSuggestionIndex}
            onToggleIndexCollapse={toggleIndexCollapse}
            onIndexInputChange={setIndexInput}
            onSetShowFieldSuggestions={setShowFieldSuggestions}
            onSetSelectedSuggestionIndex={setSelectedSuggestionIndex}
            onAddFieldToIndex={addFieldToIndex}
            onRemoveFieldFromIndex={removeFieldFromIndex}
            onToggleFieldDirection={toggleFieldDirection}
            onAddIndex={addIndex}
            onRemoveIndex={removeIndex}
          />

          <AuthPanel
            isAuthCollapsed={isAuthCollapsed}
            authInput={authInput}
            authObjects={authObjects}
            onToggleAuthCollapse={toggleAuthCollapse}
            onAuthInputChange={setAuthInput}
            onAddAuthObject={addAuthObject}
            onRemoveAuthObject={removeAuthObject}
          />

          <DataTable
            rows={rows}
            duplicateNameSet={duplicateNameSet}
            dbType={dbType}
            addCount={addCount}
            onRowsChange={handleRowsChange}
            onCreateRow={handleCreateRow}
            onRemoveRow={handleRemoveRow}
            onAddRows={handleAddRows}
            onAddCountChange={setAddCount}
          />
        </div>

        <DDLOutput
          generatedSql={generatedSql}
          generatedDcl={generatedDcl}
          dbType={dbType}
          onCopySql={copySql}
          onCopyDcl={copyDcl}
        />
      </div>

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认清空所有配置？</DialogTitle>
            <DialogDescription>
              此操作将移除当前填写的表信息、字段、索引及授权配置，且无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelClearAll}>
              取消
            </Button>
            <Button variant="destructive" onClick={confirmClearAll}>
              确认清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default App;
