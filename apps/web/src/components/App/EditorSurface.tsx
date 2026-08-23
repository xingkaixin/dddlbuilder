import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { OutputContainer } from './containers/OutputContainer';
import { TableBuilderContainer } from './containers/TableBuilderContainer';
import type { AppController } from './useAppController';

interface EditorSurfaceProps {
  controller: AppController;
  outputPanelOpen: boolean;
  setOutputPanelOpen: (open: boolean) => void;
  onOpenErDiagram: () => void;
  onOpenAISchemaPatch: () => void;
}

export function EditorSurface({
  controller,
  outputPanelOpen,
  setOutputPanelOpen,
  onOpenErDiagram,
  onOpenAISchemaPatch,
}: EditorSurfaceProps) {
  const { t } = useTranslation();
  const { actions, domains, workspace, schema, output } = controller;
  const { editor, auth, sharding, animations, partition, tableOptions, reviewState } = domains;
  const {
    aiCommentActions,
    indexAdvisor,
    reviewActions,
    clearActions,
    schemaActions,
    navigationActions,
  } = actions;
  const { setActiveTab, setObjectType } = editor;

  const handleObjectTypeChange = useCallback(
    (value: typeof editor.objectType) => {
      setObjectType(value);
      setActiveTab('fields');
    },
    [setActiveTab, setObjectType],
  );
  const handleExpandOutput = useCallback(() => setOutputPanelOpen(true), [setOutputPanelOpen]);
  const handleCollapseOutput = useCallback(() => setOutputPanelOpen(false), [setOutputPanelOpen]);

  const tableBuilderProps = useMemo(
    () => ({
      tableConfigProps: {
        schemaName: editor.schemaName,
        tableName: editor.tableName,
        tableComment: editor.tableComment,
        objectType: editor.objectType,
        dbType: editor.dbType,
        onSchemaNameChange: editor.setSchemaName,
        onTableNameChange: schema.handleTableNameChange,
        onTableCommentChange: editor.setTableComment,
        onObjectTypeChange: handleObjectTypeChange,
        onDbTypeChange: schema.handleDbTypeChange,
        onClearAll: clearActions.handleClearAll,
        onSaveCurrent: schema.handleSaveCurrent,
        onViewDiff: navigationActions.handleOpenDiffDialog,
        onViewHistory: schema.handleViewCurrentVersionHistory,
        onOpenErDiagram,
        onExpandOutputPanel:
          !workspace.isShareView && !outputPanelOpen ? handleExpandOutput : undefined,
        saveDisabled: !schema.canSaveCurrent,
        saveDisabledHint: t('dialogs.save.disabledTip'),
        showDiffButton: workspace.isLoadedDirty && schema.tableDiff?.hasChanges,
        showHistoryButton: Boolean(workspace.loadedTableNormalizedName),
        loadedTableName: workspace.loadedTableName,
        workspaceLabel: workspace.workspaceLabel,
        fieldCount: schema.filledRowCount,
        indexCount: editor.indexes.length,
      },
      tabsValue: editor.activeTab,
      onTabsValueChange: navigationActions.handleTabValueChange,
      dataTableProps: {
        isHighlighted: animations.isFieldTableHighlighted,
        highlightedRowIndex: animations.highlightedRowIndex,
        onOpenStorageEstimator: navigationActions.handleOpenStorageEstimator,
        onOpenMockDataGenerator: navigationActions.handleOpenMockDataGenerator,
        onOpenAISchemaPatch,
        onGenerateComments: aiCommentActions.handleGenerateComments,
        isGeneratingComments: aiCommentActions.isGeneratingComments,
        onOpenAIIndexAdvisor: editor.dbType === 'hive' ? undefined : indexAdvisor.openDialog,
        toolbarLeft: schema.dataTableToolbarLeft,
      },
      viewDefinitionPanelProps: {
        definition: editor.viewDefinition,
        createOrReplace: editor.viewCreateOrReplace,
        onDefinitionChange: editor.setViewDefinition,
        onCreateOrReplaceChange: editor.setViewCreateOrReplace,
      },
      indexPanelProps: {
        animatingIndexIds: animations.animatingIndexIds,
        removingIndexIds: animations.removingIndexIds,
      },
      foreignKeyPanelProps: {
        availableFields: schema.availableFields,
      },
      authPanelProps: {
        authInput: auth.authInput,
        authObjects: auth.authObjects,
        onAuthInputChange: auth.setAuthInput,
        onAddAuthObject: auth.addAuthObject,
        onRemoveAuthObject: auth.removeAuthObject,
      },
      tableOptionsPanelProps: {
        dbType: editor.dbType,
        config: tableOptions.tableMiscConfig,
        onEnabledChange: tableOptions.setMiscEnabled,
        onEngineChange: tableOptions.setEngine,
        onCharsetChange: tableOptions.setCharset,
        onCollationChange: tableOptions.setCollation,
        onTablespaceChange: tableOptions.setTablespace,
        onFillfactorChange: tableOptions.setFillfactor,
        onPctfreeChange: tableOptions.setPctfree,
        onInitransChange: tableOptions.setInitrans,
        onStoredAsChange: tableOptions.setStoredAs,
        onExternalChange: tableOptions.setExternal,
        onLocationChange: tableOptions.setLocation,
      },
      shardingPanelProps: {
        config: sharding.citusShardingConfig,
        availableFields: schema.availableFields,
        onModeChange: sharding.setCitusMode,
        onDistributionColumnChange: sharding.setDistributionColumn,
      },
      partitionPanelProps: {
        config: partition.mysqlPartitionConfig,
        availableFields: schema.availableFields,
        onEnabledChange: partition.setPartitionEnabled,
        onTypeChange: partition.setPartitionType,
        onColumnsChange: partition.setPartitionColumns,
        onExpressionChange: partition.setPartitionExpression,
        onPartitionCountChange: partition.setPartitionCount,
        onAddPartition: partition.addPartition,
        onRemovePartition: partition.removePartition,
        onUpdatePartition: partition.updatePartition,
        onGeneratePartitions: partition.generateRangePartitions,
      },
      hivePartitionPanelProps: {
        config: tableOptions.tableMiscConfig.partitions || {
          enabled: false,
          columns: [],
        },
        onEnabledChange: tableOptions.setHivePartitionEnabled,
        onAddColumn: tableOptions.addHivePartitionColumn,
        onRemoveColumn: tableOptions.removeHivePartitionColumn,
        onUpdateColumn: tableOptions.updateHivePartitionColumn,
        onClusteringChange: tableOptions.setHiveClustering,
      },
    }),
    [
      aiCommentActions.handleGenerateComments,
      aiCommentActions.isGeneratingComments,
      animations.animatingIndexIds,
      animations.highlightedRowIndex,
      animations.isFieldTableHighlighted,
      animations.removingIndexIds,
      auth.addAuthObject,
      auth.authInput,
      auth.authObjects,
      auth.removeAuthObject,
      auth.setAuthInput,
      clearActions.handleClearAll,
      editor.activeTab,
      editor.dbType,
      editor.indexes.length,
      editor.objectType,
      editor.schemaName,
      editor.setSchemaName,
      editor.setTableComment,
      editor.setViewCreateOrReplace,
      editor.setViewDefinition,
      editor.tableComment,
      editor.tableName,
      editor.viewCreateOrReplace,
      editor.viewDefinition,
      handleExpandOutput,
      handleObjectTypeChange,
      indexAdvisor.openDialog,
      navigationActions.handleOpenDiffDialog,
      navigationActions.handleOpenMockDataGenerator,
      navigationActions.handleOpenStorageEstimator,
      navigationActions.handleTabValueChange,
      onOpenAISchemaPatch,
      onOpenErDiagram,
      outputPanelOpen,
      partition.addPartition,
      partition.generateRangePartitions,
      partition.mysqlPartitionConfig,
      partition.removePartition,
      partition.setPartitionColumns,
      partition.setPartitionCount,
      partition.setPartitionEnabled,
      partition.setPartitionExpression,
      partition.setPartitionType,
      partition.updatePartition,
      schema.availableFields,
      schema.canSaveCurrent,
      schema.dataTableToolbarLeft,
      schema.filledRowCount,
      schema.handleDbTypeChange,
      schema.handleSaveCurrent,
      schema.handleTableNameChange,
      schema.handleViewCurrentVersionHistory,
      schema.tableDiff?.hasChanges,
      sharding.citusShardingConfig,
      sharding.setCitusMode,
      sharding.setDistributionColumn,
      t,
      tableOptions.addHivePartitionColumn,
      tableOptions.removeHivePartitionColumn,
      tableOptions.setCharset,
      tableOptions.setCollation,
      tableOptions.setEngine,
      tableOptions.setExternal,
      tableOptions.setFillfactor,
      tableOptions.setHiveClustering,
      tableOptions.setHivePartitionEnabled,
      tableOptions.setInitrans,
      tableOptions.setLocation,
      tableOptions.setMiscEnabled,
      tableOptions.setPctfree,
      tableOptions.setStoredAs,
      tableOptions.setTablespace,
      tableOptions.tableMiscConfig,
      tableOptions.updateHivePartitionColumn,
      workspace.isLoadedDirty,
      workspace.isShareView,
      workspace.loadedTableName,
      workspace.loadedTableNormalizedName,
      workspace.workspaceLabel,
    ],
  );

  const outputProps = useMemo(
    () => ({
      onCollapse: workspace.isShareView ? undefined : handleCollapseOutput,
      ddlOutputProps: {
        generatedSql: output.generatedSql,
        generatedDcl: output.generatedDcl,
        dbType: editor.dbType,
        routineTableNameDefault: schema.qualifiedTableName,
        sqlFormatMode: editor.sqlFormatMode,
        onSqlFormatModeChange: editor.setSqlFormatMode,
        onCopySql: output.copySql,
        onCopyDcl: output.copyDcl,
        generatedOrm: output.generatedOrm,
        ormTarget: output.ormTarget,
        onOrmTargetChange: output.setOrmTarget,
        onCopyOrm: output.copyOrm,
        isReviewing: reviewState.isLoading,
        reviewPartialResult: reviewState.partialResult,
        reviewResult: reviewState.result,
        reviewError: reviewState.error,
        schemaLintIssues: schema.schemaLintIssues,
        onStartReview: reviewActions.handleStartReview,
        onViewReviewHistory: reviewActions.handleViewReviewHistory,
        onApplySuggestion: schemaActions.handleApplySuggestion,
      },
    }),
    [
      editor.dbType,
      editor.setSqlFormatMode,
      editor.sqlFormatMode,
      handleCollapseOutput,
      output.copyDcl,
      output.copyOrm,
      output.copySql,
      output.generatedDcl,
      output.generatedOrm,
      output.generatedSql,
      output.ormTarget,
      output.setOrmTarget,
      reviewActions.handleStartReview,
      reviewActions.handleViewReviewHistory,
      reviewState.error,
      reviewState.isLoading,
      reviewState.partialResult,
      reviewState.result,
      schema.qualifiedTableName,
      schema.schemaLintIssues,
      schemaActions.handleApplySuggestion,
      workspace.isShareView,
    ],
  );

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div
        className={`min-w-0 flex-1 ${
          workspace.isShareView ? 'pointer-events-none select-none opacity-80' : ''
        }`}
      >
        <TableBuilderContainer {...tableBuilderProps} />
      </div>

      {(workspace.isShareView || outputPanelOpen) && <OutputContainer {...outputProps} />}
    </div>
  );
}
