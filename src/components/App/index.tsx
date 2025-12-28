import { useCallback, useEffect, useState } from 'react';
import type { DatabaseType, FieldRow } from '@/types';
import type { ParsedResult } from '@/utils/SqlParser';
import { createEmptyRow } from '@/utils/helpers';
import { Header } from './Header';
import { TableConfig } from './TableConfig';
import { IndexPanel } from './IndexPanel';
import { AuthPanel } from './AuthPanel';
import { ShardingPanel } from './ShardingPanel';
import { PartitionPanel } from './PartitionPanel';
import { DataTable } from './DataTable';
import { DDLOutput } from './DDLOutput';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  usePersistedState,
  useTableData,
  useIndexManagement,
  useAuthManagement,
  useSqlGeneration,
  useToast,
  useCitusSharding,
} from '@/hooks';
import { useMysqlPartition } from '@/hooks/useMysqlPartition';
import { sanitizeIndexesForPersist } from '@/utils/indexUtils';
import { compressState } from '@/utils/share';
import {
  Columns3Cog,
  Network,
  ShieldUser,
  Key,
  Lock,
  Hash,
  Share2,
  Layers,
} from 'lucide-react';

const INITIAL_ROWS = Array.from({ length: 12 }, (_, index) =>
  createEmptyRow(index),
);

function App() {
  // Basic state
  const [tableName, setTableName] = useState('');
  const [tableComment, setTableComment] = useState('');
  const [dbType, setDbType] = useState<DatabaseType>('mysql');
  const [addCount, setAddCount] = useState<number>(10);

  // Changelog modal state
  const [showChangelog, setShowChangelog] = useState(false);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);

  // Use custom hooks
  const { persistedState, hydrated, saveState, clearState } =
    usePersistedState();

  const {
    rows,
    duplicateNameSet,
    normalizedFields,
    resetTableRows,
    handleRowsChange,
    handleCreateRow,
    handleRemoveRow,
    handleAddRows,
    setRows,
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
    updateIndexName,
    resetIndexState,
    setIndexes,
  } = useIndexManagement(
    tableName,
    availableFields,
    persistedState || undefined,
    dbType,
  );

  const {
    authInput,
    authObjects,
    setAuthInput,
    addAuthObject,
    removeAuthObject,
    resetAuthState,
    setAuthObjects,
  } = useAuthManagement(persistedState || undefined);

  const {
    citusShardingConfig,
    setCitusMode,
    setDistributionColumn,
    resetCitusSharding,
  } = useCitusSharding(persistedState || undefined);

  const {
    mysqlPartitionConfig,
    setPartitionEnabled,
    setPartitionType,
    setPartitionColumns,
    setPartitionExpression,
    setPartitionCount,
    addPartition,
    removePartition,
    updatePartition,
    generateRangePartitions,
    resetPartition,
  } = useMysqlPartition(persistedState || undefined);

  // Check if MySQL-compatible database that supports partitioning
  const supportsMysqlPartition = ['mysql', 'mariadb', 'tidb'].includes(dbType);

  const { generatedSql, generatedDcl, copySql, copyDcl } = useSqlGeneration(
    dbType,
    tableName,
    tableComment,
    normalizedFields,
    indexes,
    authObjects,
    dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
    supportsMysqlPartition ? mysqlPartitionConfig : undefined,
  );

  const { toastMessage, showToast } = useToast();

  const handleShare = useCallback(() => {
    const currentState = {
      tableName,
      tableComment,
      dbType,
      rows: rows.map((row) => ({
        ...row,
        order: row.order || 0,
        fieldName: row.fieldName || '',
        fieldComment: row.fieldComment || '',
        fieldType: row.fieldType || '',
        nullable: row.nullable ? '是' : '否',
        defaultKind: row.defaultKind || '',
        defaultValue: row.defaultValue || '',
        onUpdate: row.onUpdate || '',
      })),
      addCount,
      indexInput,
      currentIndexFields,
      indexes: sanitizeIndexesForPersist(indexes),
      authInput,
      authObjects,
      citusShardingConfig:
        dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
      mysqlPartitionConfig: supportsMysqlPartition
        ? mysqlPartitionConfig
        : undefined,
    };

    try {
      const compressed = compressState(currentState);
      const url = `${window.location.origin}${window.location.pathname}?s=${compressed}`;
      navigator.clipboard.writeText(url);
      showToast('链接已复制到剪贴板');
    } catch (e) {
      console.error('Failed to generate share link', e);
      showToast('生成链接失败');
    }
  }, [
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
    citusShardingConfig,
    mysqlPartitionConfig,
    supportsMysqlPartition,
    showToast,
  ]);

  // restore basic state from localStorage once on mount
  useEffect(() => {
    if (!hydrated || !persistedState) return;

    if (typeof persistedState.tableName === 'string')
      setTableName(persistedState.tableName);
    if (typeof persistedState.tableComment === 'string')
      setTableComment(persistedState.tableComment);
    if (
      persistedState.dbType === 'mysql' ||
      persistedState.dbType === 'postgresql' ||
      persistedState.dbType === 'postgresql-citus' ||
      persistedState.dbType === 'sqlserver' ||
      persistedState.dbType === 'oracle'
    ) {
      setDbType(persistedState.dbType);
    }
    if (
      typeof persistedState.addCount === 'number' &&
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
        rows: rows.map((row) => ({
          ...row,
          // Ensure all required fields are present
          order: row.order || 0,
          fieldName: row.fieldName || '',
          fieldComment: row.fieldComment || '',
          fieldType: row.fieldType || '',
          nullable: row.nullable ? '是' : '否',
          defaultKind: row.defaultKind || '',
          defaultValue: row.defaultValue || '',
          onUpdate: row.onUpdate || '',
        })),
        addCount,
        indexInput,
        currentIndexFields,
        indexes: sanitizeIndexesForPersist(indexes),
        authInput,
        authObjects,
        citusShardingConfig:
          dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
        mysqlPartitionConfig: supportsMysqlPartition
          ? mysqlPartitionConfig
          : undefined,
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
    citusShardingConfig,
    mysqlPartitionConfig,
    supportsMysqlPartition,
    saveState,
  ]);

  const handleClearAll = useCallback(() => {
    setIsClearDialogOpen(true);
  }, []);

  const cancelClearAll = useCallback(() => {
    setIsClearDialogOpen(false);
  }, []);

  const confirmClearAll = useCallback(() => {
    setTableName('');
    setTableComment('');
    setDbType('mysql');
    setAddCount(10);
    resetTableRows();
    resetIndexState();
    resetAuthState();
    resetCitusSharding();
    resetPartition();

    // Clear localStorage
    clearState();

    cancelClearAll();
  }, [
    cancelClearAll,
    clearState,
    resetTableRows,
    resetIndexState,
    resetAuthState,
    resetCitusSharding,
    resetPartition,
  ]);

  const handleImport = useCallback(
    (result: ParsedResult, importDbType: DatabaseType) => {
      // 1. Basic Info
      setTableName(result.tableName);
      setTableComment(result.tableComment);
      setDbType(importDbType);

      // 2. Fields
      const newRows: FieldRow[] = result.fields.map((field, index) => {
        let uiNullable = '是';
        if (field.nullable === false) uiNullable = '否';

        let uiDefaultKind = '无';
        switch (field.defaultKind) {
          case 'auto_increment':
            uiDefaultKind = '自增';
            break;
          case 'constant':
            uiDefaultKind = '常量';
            break;
          case 'current_timestamp':
            uiDefaultKind = '当前时间';
            break;
          case 'uuid':
            uiDefaultKind = 'uuid';
            break;
        }

        let uiOnUpdate = '无';
        if (field.onUpdate === 'current_timestamp') uiOnUpdate = '当前时间';

        return {
          order: index + 1,
          fieldName: field.name,
          fieldType: field.type,
          fieldComment: field.comment,
          nullable: uiNullable,
          defaultKind: uiDefaultKind,
          defaultValue: field.defaultValue,
          onUpdate: uiOnUpdate,
        };
      });

      // Pad with empty rows if needed
      const minRows = 12;
      if (newRows.length < minRows) {
        for (let i = newRows.length; i < minRows; i++) {
          newRows.push(createEmptyRow(i));
        }
      }
      setRows(newRows);

      // 3. Indexes
      setIndexes(result.indexes);
      setIndexInput('');

      // 4. Auth
      setAuthObjects(result.authObjects);
      setAuthInput('');
    },
    [setRows, setIndexes, setAuthObjects, setIndexInput, setAuthInput],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header
        showChangelog={showChangelog}
        setShowChangelog={setShowChangelog}
        onShare={handleShare}
        currentDbType={dbType}
        onImport={handleImport}
      />

      {/* Main Content */}
      <div className="flex flex-col gap-4 p-4 lg:flex-row">
        <div className="flex flex-1 flex-col gap-4">
          <TableConfig
            tableName={tableName}
            tableComment={tableComment}
            dbType={dbType}
            onTableNameChange={setTableName}
            onTableCommentChange={setTableComment}
            onDbTypeChange={setDbType}
            onClearAll={handleClearAll}
          />

          <Tabs defaultValue="fields" className="w-full">
            <TabsList
              className={`grid w-full ${
                dbType === 'postgresql-citus' || supportsMysqlPartition
                  ? 'grid-cols-4'
                  : 'grid-cols-3'
              }`}
            >
              <TabsTrigger value="fields" className="gap-2">
                <Columns3Cog className="h-4 w-4" />
                字段配置
                {rows.filter((r) => r.fieldName?.trim()).length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {rows.filter((r) => r.fieldName?.trim()).length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="indexes" className="gap-2">
                <Network className="h-4 w-4" />
                索引配置
                {indexes.length > 0 && (
                  <div className="ml-2 flex items-center gap-2">
                    {indexes.some((i) => i.isPrimary) && (
                      <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                        <Key className="h-3 w-3" />
                        {indexes.filter((i) => i.isPrimary).length}
                      </span>
                    )}
                    {indexes.some((i) => i.unique && !i.isPrimary) && (
                      <span className="inline-flex items-center gap-1 text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">
                        <Lock className="h-3 w-3" />
                        {indexes.filter((i) => i.unique && !i.isPrimary).length}
                      </span>
                    )}
                    {indexes.some((i) => !i.unique && !i.isPrimary) && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                        <Hash className="h-3 w-3" />
                        {
                          indexes.filter((i) => !i.unique && !i.isPrimary)
                            .length
                        }
                      </span>
                    )}
                  </div>
                )}
              </TabsTrigger>
              <TabsTrigger value="auth" className="gap-2">
                <ShieldUser className="h-4 w-4" />
                授权配置
                {authObjects.length > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {authObjects.length}
                  </span>
                )}
              </TabsTrigger>
              {dbType === 'postgresql-citus' && (
                <TabsTrigger value="sharding" className="gap-2">
                  <Share2 className="h-4 w-4" />
                  分片配置
                  {citusShardingConfig.mode === 'distributed' &&
                    citusShardingConfig.distributionColumn && (
                      <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {citusShardingConfig.distributionColumn}
                      </span>
                    )}
                </TabsTrigger>
              )}
              {supportsMysqlPartition && (
                <TabsTrigger value="partition" className="gap-2">
                  <Layers className="h-4 w-4" />
                  分区配置
                  {mysqlPartitionConfig.enabled && (
                    <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {mysqlPartitionConfig.type}
                    </span>
                  )}
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="fields" className="mt-4">
              <DataTable
                rows={rows}
                duplicateNameSet={duplicateNameSet}
                dbType={dbType}
                addCount={addCount}
                onRowsChange={handleRowsChange as any}
                onCreateRow={handleCreateRow}
                onRemoveRow={handleRemoveRow}
                onAddRows={handleAddRows}
                onAddCountChange={setAddCount}
              />
            </TabsContent>
            <TabsContent value="indexes" className="mt-4">
              <IndexPanel
                indexInput={indexInput}
                currentIndexFields={currentIndexFields}
                indexes={indexes}
                fieldSuggestions={fieldSuggestions}
                showFieldSuggestions={showFieldSuggestions}
                selectedSuggestionIndex={selectedSuggestionIndex}
                onIndexInputChange={setIndexInput}
                onSetShowFieldSuggestions={setShowFieldSuggestions}
                onSetSelectedSuggestionIndex={setSelectedSuggestionIndex}
                onAddFieldToIndex={addFieldToIndex}
                onRemoveFieldFromIndex={removeFieldFromIndex}
                onToggleFieldDirection={toggleFieldDirection}
                onAddIndex={(unique, primary) => addIndex(!!unique, primary)}
                onRemoveIndex={removeIndex}
                onUpdateIndexName={updateIndexName}
              />
            </TabsContent>
            <TabsContent value="auth" className="mt-4">
              <AuthPanel
                authInput={authInput}
                authObjects={authObjects}
                onAuthInputChange={setAuthInput}
                onAddAuthObject={addAuthObject}
                onRemoveAuthObject={removeAuthObject}
              />
            </TabsContent>
            {dbType === 'postgresql-citus' && (
              <TabsContent value="sharding" className="mt-4">
                <ShardingPanel
                  config={citusShardingConfig}
                  availableFields={availableFields}
                  onModeChange={setCitusMode}
                  onDistributionColumnChange={setDistributionColumn}
                />
              </TabsContent>
            )}
            {supportsMysqlPartition && (
              <TabsContent value="partition" className="mt-4">
                <PartitionPanel
                  config={mysqlPartitionConfig}
                  availableFields={availableFields}
                  onEnabledChange={setPartitionEnabled}
                  onTypeChange={setPartitionType}
                  onColumnsChange={setPartitionColumns}
                  onExpressionChange={setPartitionExpression}
                  onPartitionCountChange={setPartitionCount}
                  onAddPartition={addPartition}
                  onRemovePartition={removePartition}
                  onUpdatePartition={updatePartition}
                  onGeneratePartitions={generateRangePartitions}
                />
              </TabsContent>
            )}
          </Tabs>
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

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2 transform rounded-full bg-foreground/90 px-4 py-2 text-sm text-background shadow-lg transition-all animate-in fade-in slide-in-from-bottom-4">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
