import { useMemo, type ReactNode } from 'react';
import type { HivePartitionConfig } from '@ddlbuilder/shared-types';
import type { EditorContentView } from '@/stores/appUiStore';
import { useTranslation } from 'react-i18next';
import type { EditorSurfaceModel } from '../EditorSurface';
import type { useEditorDomains } from './useEditorDomains';
import type { useSchemaController } from './useSchemaController';
import type { useClearAllActions } from './useClearAllActions';
import type { useNavigationActions } from './useNavigationActions';
import type { useSchemaApplyActions } from './useSchemaApplyActions';
import { hasTableChanges } from '@ddlbuilder/ddl-core';

type EditorDomains = ReturnType<typeof useEditorDomains>;

type SchemaController = ReturnType<typeof useSchemaController>;

const EMPTY_HIVE_PARTITION_CONFIG: HivePartitionConfig = { enabled: false, columns: [] };

interface UseEditorSurfaceModelInput {
  documentId: string;
  domains: EditorDomains;
  schemaController: SchemaController;
  clearActions: ReturnType<typeof useClearAllActions>;
  navigationActions: ReturnType<typeof useNavigationActions>;
  schemaActions: ReturnType<typeof useSchemaApplyActions>;
  isShareView: boolean;
  editorView: EditorContentView;
  setEditorView: (view: EditorContentView) => void;
  isLoadedDirty: boolean;
  loadedTableName: string | null;
  loadedTableNormalizedName: string | null;
  workspaceLabel: string;
  dataTableToolbarLeft: ReactNode;
  onTableNameChange: (value: string) => void;
  onDbTypeChange: EditorSurfaceModel['tableConfigProps']['onDbTypeChange'];
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
  editorView,
  setEditorView,
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
}: UseEditorSurfaceModelInput): Omit<EditorSurfaceModel, 'editorView' | 'setEditorView'> &
  Pick<UseEditorSurfaceModelInput, 'editorView' | 'setEditorView'> {
  const { t } = useTranslation();
  const { editor, auth, sharding, animations, partition, tableOptions } = domains;

  const {
    schemaName,
    tableName,
    tableComment,
    objectType,
    dbType,
    activeTab,
    viewDefinition,
    viewCreateOrReplace,
    sqlFormatMode,
    setSchemaName,
    setTableComment,
    setObjectType,
    setViewDefinition,
    setViewCreateOrReplace,
    setSqlFormatMode,
  } = editor;
  const { authInput, authObjects, setAuthInput, addAuthObject, removeAuthObject } = auth;

  const {
    citusShardingConfig,
    setCitusMode: onShardingModeChange,
    setDistributionColumn,
  } = sharding;
  const { isFieldTableHighlighted, highlightedRowIndex, animatingIndexIds, removingIndexIds } =
    animations;
  const { mysqlPartitionConfig } = partition;

  const {
    tableMiscConfig,
    setMiscEnabled,
    setEngine,
    setCharset,
    setCollation,
    setTablespace,
    setFillfactor,
    setPctfree,
    setInitrans,
    setStoredAs,
    setExternal,
    setLocation,
    setHivePartitionEnabled,
    addHivePartitionColumn,
    removeHivePartitionColumn,
    updateHivePartitionColumn,
    setHiveClustering,
  } = tableOptions;
  const { handleClearAll } = clearActions;

  const {
    handleOpenDiffDialog,
    handleTabValueChange,
    handleOpenStorageEstimator,
    handleOpenMockDataGenerator,
  } = navigationActions;

  const {
    derived: { canSaveCurrent, tableDiff },
    availableFields,
    sql,
    orm,
    aiCommentActions,
    indexAdvisor,
    reviewState,
    reviewActions,
    qualifiedTableName,
    schemaLintIssues,
  } = schemaController;
  const showDiffButton = isLoadedDirty && Boolean(tableDiff && hasTableChanges(tableDiff));
  const supportsAI = dbType !== 'sqlite';

  const tableConfigProps = useMemo(
    () => ({
      schemaName,
      tableName,
      tableComment,
      objectType,
      dbType,
      onSchemaNameChange: setSchemaName,
      onTableNameChange,
      onTableCommentChange: setTableComment,
      onObjectTypeChange: setObjectType,
      onDbTypeChange,
      onClearAll: handleClearAll,
      onSaveCurrent,
      onViewDiff: handleOpenDiffDialog,
      onViewHistory: onViewCurrentVersionHistory,
      onOpenErDiagram,
      saveDisabled: !canSaveCurrent,
      saveDisabledHint: t('dialogs.save.disabledTip'),
      showDiffButton,
      showHistoryButton: Boolean(loadedTableNormalizedName),
      loadedTableName,
      workspaceLabel,
    }),
    [
      schemaName,
      tableName,
      tableComment,
      objectType,
      dbType,
      setSchemaName,
      onTableNameChange,
      setTableComment,
      setObjectType,
      onDbTypeChange,
      handleClearAll,
      onSaveCurrent,
      handleOpenDiffDialog,
      onViewCurrentVersionHistory,
      onOpenErDiagram,
      canSaveCurrent,
      t,
      showDiffButton,
      loadedTableNormalizedName,
      loadedTableName,
      workspaceLabel,
    ],
  );

  const dataTableProps = useMemo(
    () => ({
      isHighlighted: isFieldTableHighlighted,
      highlightedRowIndex,
      onOpenStorageEstimator: supportsAI ? handleOpenStorageEstimator : undefined,
      onOpenMockDataGenerator: supportsAI ? handleOpenMockDataGenerator : undefined,
      onOpenAISchemaPatch: supportsAI ? onOpenAISchemaPatch : undefined,
      onGenerateComments: supportsAI ? aiCommentActions.handleGenerateComments : undefined,
      isGeneratingComments: aiCommentActions.isGeneratingComments,
      onOpenAIIndexAdvisor: supportsAI && dbType !== 'hive' ? indexAdvisor.openDialog : undefined,
      toolbarLeft: dataTableToolbarLeft,
    }),
    [
      isFieldTableHighlighted,
      highlightedRowIndex,
      supportsAI,
      handleOpenStorageEstimator,
      handleOpenMockDataGenerator,
      onOpenAISchemaPatch,
      aiCommentActions.handleGenerateComments,
      aiCommentActions.isGeneratingComments,
      dbType,
      indexAdvisor.openDialog,
      dataTableToolbarLeft,
    ],
  );

  const tableBuilderProps = useMemo(
    () => ({
      objectType,
      dbType,
      tabsValue: activeTab,
      onTabsValueChange: handleTabValueChange,
      dataTableProps,
      viewDefinitionPanelProps: {
        definition: viewDefinition,
        createOrReplace: viewCreateOrReplace,
        onDefinitionChange: setViewDefinition,
        onCreateOrReplaceChange: setViewCreateOrReplace,
      },
      indexPanelProps: { availableFields, animatingIndexIds, removingIndexIds },
      foreignKeyPanelProps: { availableFields },
      authPanelProps: {
        authInput,
        authObjects,
        onAuthInputChange: setAuthInput,
        onAddAuthObject: addAuthObject,
        onRemoveAuthObject: removeAuthObject,
      },
      tableOptionsPanelProps: {
        dbType,
        config: tableMiscConfig,
        onEnabledChange: setMiscEnabled,
        onEngineChange: setEngine,
        onCharsetChange: setCharset,
        onCollationChange: setCollation,
        onTablespaceChange: setTablespace,
        onFillfactorChange: setFillfactor,
        onPctfreeChange: setPctfree,
        onInitransChange: setInitrans,
        onStoredAsChange: setStoredAs,
        onExternalChange: setExternal,
        onLocationChange: setLocation,
      },
      shardingPanelProps: {
        config: citusShardingConfig,
        availableFields,
        onModeChange: onShardingModeChange,
        onDistributionColumnChange: setDistributionColumn,
      },
      partitionPanelProps: {
        config: mysqlPartitionConfig,
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
        config: tableMiscConfig.partitions ?? EMPTY_HIVE_PARTITION_CONFIG,
        onEnabledChange: setHivePartitionEnabled,
        onAddColumn: addHivePartitionColumn,
        onRemoveColumn: removeHivePartitionColumn,
        onUpdateColumn: updateHivePartitionColumn,
        onClusteringChange: setHiveClustering,
      },
    }),
    [
      objectType,
      dbType,
      activeTab,
      handleTabValueChange,
      dataTableProps,
      viewDefinition,
      viewCreateOrReplace,
      setViewDefinition,
      setViewCreateOrReplace,
      availableFields,
      animatingIndexIds,
      removingIndexIds,
      authInput,
      authObjects,
      setAuthInput,
      addAuthObject,
      removeAuthObject,
      tableMiscConfig,
      setMiscEnabled,
      setEngine,
      setCharset,
      setCollation,
      setTablespace,
      setFillfactor,
      setPctfree,
      setInitrans,
      setStoredAs,
      setExternal,
      setLocation,
      setHivePartitionEnabled,
      addHivePartitionColumn,
      removeHivePartitionColumn,
      updateHivePartitionColumn,
      setHiveClustering,
      citusShardingConfig,
      onShardingModeChange,
      setDistributionColumn,
      mysqlPartitionConfig,
      partition,
    ],
  );

  const ddlOutputProps = useMemo(
    () => ({
      generatedSql: sql.generatedSql,
      generatedDcl: sql.generatedDcl,
      dbType,
      routineTableNameDefault: qualifiedTableName,
      sqlFormatMode,
      onSqlFormatModeChange: setSqlFormatMode,
      onCopySql: sql.copySql,
      onCopyDcl: sql.copyDcl,
      generateOrm: orm.getGeneratedOrm,
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
    }),
    [
      sql.generatedSql,
      sql.generatedDcl,
      dbType,
      qualifiedTableName,
      sqlFormatMode,
      setSqlFormatMode,
      sql.copySql,
      sql.copyDcl,
      orm.getGeneratedOrm,
      orm.ormTarget,
      orm.setOrmTarget,
      orm.copyOrm,
      reviewState.isLoading,
      reviewState.partialResult,
      reviewState.result,
      reviewState.error,
      schemaLintIssues,
      reviewActions.handleStartReview,
      reviewActions.handleViewReviewHistory,
      schemaActions.handleApplySuggestion,
    ],
  );
  const outputProps = useMemo(() => ({ ddlOutputProps }), [ddlOutputProps]);

  return {
    documentId,
    isShareView,
    editorView,
    setEditorView,
    tableConfigProps,
    tableBuilderProps,
    outputProps,
  };
}
