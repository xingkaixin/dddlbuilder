import { type SavedTableTarget } from '@ddlbuilder/shared-types/workspace';
import { useMemo } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DDLReviewResult } from '@ddlbuilder/shared-types/ddl-review';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useSqlGeneration } from '@/hooks/useSqlGeneration';
import { useOrmGeneration } from '@/hooks/useOrmGeneration';
import { useTabStore } from '@/stores/tabStore';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';
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
  countTableVersions: (normalizedName: SavedTableTarget) => Promise<number>;
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
  });
  const loadedPresentation = useLoadedTablePresentation({
    hydrated,
    isShareView,
    normalizedName: loadedTableNormalizedName,
    tableId: loadedTableId,
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
  const orm = useOrmGeneration({
    dbType,
    schemaName,
    tableName,
    tableComment,
    fields: derived.normalizedFields,
    indexes,
    foreignKeys,
  });
  const activeTabId = useTabStore((state) => state.activeTabId);
  const getDocumentKey = (state: PersistedState, tabId = activeTabId) =>
    JSON.stringify([
      workspaceScope ? getWorkspaceScopeStorageKey(workspaceScope) : null,
      tabId,
      serializePersistedStateForComparison(state),
    ]);
  const documentKey = getDocumentKey(derived.currentPersistedState);
  const aiCommentActions = useAICommentActions({
    documentKey,
    getCurrentDocumentKey: () =>
      getDocumentKey(derived.buildPersistedState(), useTabStore.getState().activeTabId),
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
  const reviewActions = useReviewActions({
    documentKey,
    dbType,
    tableName: qualifiedTableName,
    generatedSql: sql.generatedSql,
    workspaceScope,
    loadedTableId,
    loadedTableNormalizedName,
    setIsReviewHistoryOpen,
  });
  const reviewState = {
    ...reviewActions.reviewState,
    setReviewResult: (result: DDLReviewResult | null, state: PersistedState) =>
      reviewActions.reviewState.setReviewResult(result, getDocumentKey(state)),
  };
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
