import { useMemo } from 'react';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useSqlGeneration } from '@/hooks/useSqlGeneration';
import { useOrmGeneration } from '@/hooks/useOrmGeneration';
import { useDDLReview } from '@/hooks/useDDLReview';
import { useToast } from '@/hooks/useToast';
import { lintSchema } from '@/utils/schemaLint';
import { useDerivedTableState } from './useDerivedTableState';
import { useAICommentActions } from './useAICommentActions';
import { useIndexAdvisorFlow } from './useIndexAdvisorFlow';
import { useReviewActions } from './useReviewActions';
import { useShareAction } from './useShareAction';
import { useLoadedTablePresentation } from './useLoadedTablePresentation';
import type { useEditorDomains } from './useEditorDomains';

type EditorDomains = ReturnType<typeof useEditorDomains>;

interface UseSchemaControllerParams {
  domains: EditorDomains;
  hydrated: boolean;
  isShareView: boolean;
  workspaceScope: WorkspaceScope | null;
  loadedTableId: string | null;
  loadedTableNormalizedName: string | null;
  loadedTableName: string | null;
  loadedTableSignature: string | null;
  countTableVersions: (normalizedName: string) => Promise<number>;
}

export function useSchemaController({
  domains,
  hydrated,
  isShareView,
  workspaceScope,
  loadedTableId,
  loadedTableNormalizedName,
  loadedTableName,
  loadedTableSignature,
  countTableVersions,
}: UseSchemaControllerParams) {
  const { editor, ui, auth, sharding, partition, tableOptions } = domains;
  const {
    schemaName,
    tableName,
    tableComment,
    objectType,
    viewDefinition,
    viewCreateOrReplace,
    dbType,
    sqlFormatMode,
    addCount,
    rows,
    setRows,
    setTableComment,
    setActiveTab,
    indexInput,
    currentIndexFields,
    indexes,
    updateIndexNames,
    setIndexes,
    foreignKeys,
    fieldTableFreezeEnabled,
    fieldTableFreezeColumns,
  } = editor;
  const { setIsReviewHistoryOpen } = ui;
  const { authInput, authObjects } = auth;
  const { citusShardingConfig } = sharding;
  const { mysqlPartitionConfig } = partition;
  const { tableMiscConfig } = tableOptions;
  const { showToast } = useToast();
  const qualifiedTableName = useMemo(
    () => buildQualifiedTableName(schemaName, tableName),
    [schemaName, tableName],
  );
  const derived = useDerivedTableState({
    objectType,
    schemaName,
    tableName,
    tableComment,
    viewDefinition,
    viewCreateOrReplace,
    dbType,
    sqlFormatMode,
    addCount,
    rows,
    indexes,
    indexInput,
    currentIndexFields,
    foreignKeys,
    authInput,
    authObjects,
    citusShardingConfig,
    mysqlPartitionConfig,
    tableMiscConfig,
    fieldTableFreezeEnabled,
    fieldTableFreezeColumns,
    loadedTableNormalizedName,
    loadedTableSignature,
    updateIndexNames,
  });
  const loadedPresentation = useLoadedTablePresentation({
    hydrated,
    isShareView,
    normalizedName: loadedTableNormalizedName,
    tableName: loadedTableName,
    isDirty: derived.isLoadedDirty,
    countTableVersions,
  });
  const sql = useSqlGeneration(
    objectType,
    dbType,
    schemaName,
    tableName,
    tableComment,
    viewDefinition,
    viewCreateOrReplace,
    derived.normalizedFields,
    indexes,
    authObjects,
    sqlFormatMode,
    dbType === 'postgresql-citus' ? citusShardingConfig : undefined,
    derived.supportsMysqlPartition ? mysqlPartitionConfig : undefined,
    tableMiscConfig,
    foreignKeys,
  );
  const orm = useOrmGeneration(
    qualifiedTableName,
    tableComment,
    derived.normalizedFields,
    indexes,
    foreignKeys,
  );
  const aiCommentActions = useAICommentActions({
    schemaName,
    tableName,
    tableComment,
    rows,
    setTableComment,
    setRows,
  });
  const indexAdvisor = useIndexAdvisorFlow({
    dbType,
    schemaName,
    tableName,
    tableComment,
    fields: derived.normalizedFields,
    indexes,
    setIndexes,
    setActiveTab,
  });
  const reviewState = useDDLReview();
  const reviewActions = useReviewActions({
    dbType,
    tableName: qualifiedTableName,
    generatedSql: sql.generatedSql,
    workspaceScope,
    loadedTableId,
    loadedTableNormalizedName,
    isReviewing: reviewState.isLoading,
    reviewResult: reviewState.result,
    startReview: reviewState.startReview,
    setIsReviewHistoryOpen,
  });
  const schemaLintIssues = useMemo(
    () =>
      lintSchema({
        tableName,
        rows,
        indexes,
        currentIndexFields,
        foreignKeys,
        mysqlPartitionConfig,
        citusShardingConfig,
        tableMiscConfig,
      }),
    [
      citusShardingConfig,
      currentIndexFields,
      foreignKeys,
      indexes,
      mysqlPartitionConfig,
      rows,
      tableMiscConfig,
      tableName,
    ],
  );
  const shareAction = useShareAction({
    buildPersistedState: derived.buildPersistedState,
    showToast,
  });

  return {
    derived,
    loadedPresentation,
    qualifiedTableName,
    sql,
    orm,
    aiCommentActions,
    indexAdvisor,
    reviewState,
    reviewActions,
    schemaLintIssues,
    shareAction,
    showToast,
  };
}
