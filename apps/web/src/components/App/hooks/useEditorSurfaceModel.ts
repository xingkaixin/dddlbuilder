import { useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { EditorSurfaceModel } from '../EditorSurface';
import type { useEditorDomains } from './useEditorDomains';
import type { useSchemaController } from './useSchemaController';
import type { useClearAllActions } from './useClearAllActions';
import type { useNavigationActions } from './useNavigationActions';
import type { useSchemaApplyActions } from './useSchemaApplyActions';

type EditorDomains = ReturnType<typeof useEditorDomains>;
type SchemaController = ReturnType<typeof useSchemaController>;

interface UseEditorSurfaceModelInput {
  documentId: string;
  domains: EditorDomains;
  schemaController: SchemaController;
  clearActions: ReturnType<typeof useClearAllActions>;
  navigationActions: ReturnType<typeof useNavigationActions>;
  schemaActions: ReturnType<typeof useSchemaApplyActions>;
  isShareView: boolean;
  outputPanelOpen: boolean;
  setOutputPanelOpen: (open: boolean) => void;
  isLoadedDirty: boolean;
  loadedTableName: string | null;
  loadedTableNormalizedName: string | null;
  workspaceLabel: string;
  dataTableToolbarLeft: ReactNode;
  onTableNameChange: (value: string) => void;
  onDbTypeChange: EditorSurfaceModel['tableBuilderProps']['tableConfigProps']['onDbTypeChange'];
  onSaveCurrent: () => void;
  onViewCurrentVersionHistory: () => void;
  onOpenErDiagram: () => void;
  onOpenAISchemaPatch: () => void;
}

export function useEditorSurfaceModel({
  documentId,
  domains,
  schemaController,
  clearActions,
  navigationActions,
  schemaActions,
  isShareView,
  outputPanelOpen,
  setOutputPanelOpen,
  isLoadedDirty,
  loadedTableName,
  loadedTableNormalizedName,
  workspaceLabel,
  dataTableToolbarLeft,
  onTableNameChange,
  onDbTypeChange,
  onSaveCurrent,
  onViewCurrentVersionHistory,
  onOpenErDiagram,
  onOpenAISchemaPatch,
}: UseEditorSurfaceModelInput): EditorSurfaceModel {
  const { t } = useTranslation();
  const { editor, auth, sharding, animations, partition, tableOptions } = domains;
  const { setObjectType, setActiveTab } = editor;
  const {
    derived: { availableFields, canSaveCurrent, filledRowCount, tableDiff },
    sql,
    orm,
    aiCommentActions,
    indexAdvisor,
    reviewState,
    reviewActions,
    qualifiedTableName,
    schemaLintIssues,
  } = schemaController;
  const handleObjectTypeChange = useCallback(
    (value: typeof editor.objectType) => {
      setObjectType(value);
      setActiveTab('fields');
    },
    [setObjectType, setActiveTab],
  );
  const expandOutput = useCallback(() => setOutputPanelOpen(true), [setOutputPanelOpen]);
  const collapseOutput = useCallback(() => setOutputPanelOpen(false), [setOutputPanelOpen]);

  return {
    documentId,
    isShareView,
    outputPanelOpen,
    tableBuilderProps: {
      tableConfigProps: {
        schemaName: editor.schemaName,
        tableName: editor.tableName,
        tableComment: editor.tableComment,
        objectType: editor.objectType,
        dbType: editor.dbType,
        onSchemaNameChange: editor.setSchemaName,
        onTableNameChange,
        onTableCommentChange: editor.setTableComment,
        onObjectTypeChange: handleObjectTypeChange,
        onDbTypeChange,
        onClearAll: clearActions.handleClearAll,
        onSaveCurrent,
        onViewDiff: navigationActions.handleOpenDiffDialog,
        onViewHistory: onViewCurrentVersionHistory,
        onOpenErDiagram,
        onExpandOutputPanel: !isShareView && !outputPanelOpen ? expandOutput : undefined,
        saveDisabled: !canSaveCurrent,
        saveDisabledHint: t('dialogs.save.disabledTip'),
        showDiffButton: isLoadedDirty && tableDiff?.hasChanges,
        showHistoryButton: Boolean(loadedTableNormalizedName),
        loadedTableName,
        workspaceLabel,
        fieldCount: filledRowCount,
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
        toolbarLeft: dataTableToolbarLeft,
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
      foreignKeyPanelProps: { availableFields },
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
        availableFields,
        onModeChange: sharding.setCitusMode,
        onDistributionColumnChange: sharding.setDistributionColumn,
      },
      partitionPanelProps: {
        config: partition.mysqlPartitionConfig,
        availableFields,
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
        config: tableOptions.tableMiscConfig.partitions || { enabled: false, columns: [] },
        onEnabledChange: tableOptions.setHivePartitionEnabled,
        onAddColumn: tableOptions.addHivePartitionColumn,
        onRemoveColumn: tableOptions.removeHivePartitionColumn,
        onUpdateColumn: tableOptions.updateHivePartitionColumn,
        onClusteringChange: tableOptions.setHiveClustering,
      },
    },
    outputProps: {
      onCollapse: isShareView ? undefined : collapseOutput,
      ddlOutputProps: {
        generatedSql: sql.generatedSql,
        generatedDcl: sql.generatedDcl,
        dbType: editor.dbType,
        routineTableNameDefault: qualifiedTableName,
        sqlFormatMode: editor.sqlFormatMode,
        onSqlFormatModeChange: editor.setSqlFormatMode,
        onCopySql: sql.copySql,
        onCopyDcl: sql.copyDcl,
        generatedOrm: orm.generatedOrm,
        ormTarget: orm.ormTarget,
        onOrmTargetChange: orm.setOrmTarget,
        onCopyOrm: orm.copyOrm,
        isReviewing: reviewState.isLoading,
        reviewPartialResult: reviewState.partialResult,
        reviewResult: reviewState.result,
        reviewError: reviewState.error,
        schemaLintIssues,
        onStartReview: reviewActions.handleStartReview,
        onViewReviewHistory: reviewActions.handleViewReviewHistory,
        onApplySuggestion: schemaActions.handleApplySuggestion,
      },
    },
  };
}
