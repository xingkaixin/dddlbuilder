import {
  type SavedTableTarget,
  type WorkspaceScope,
  type WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import { useMemo } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { DDLReviewResult } from '@ddlbuilder/shared-types/ddl-review';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import { useSqlGeneration } from '@/hooks/useSqlGeneration';
import { useOrmGeneration } from '@/hooks/useOrmGeneration';
import { useTabStore, type WorkspaceTab } from '@/stores/tabStore';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import { buildSchemaStateSignature } from '@/utils/persistedStateSignature';
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

function getDocumentSourceIdentity(source: WorkspaceSelection) {
  if (source.kind === 'draft') return ['draft', source.draftId];
  return source.tableId
    ? ['saved_table', 'id', source.tableId]
    : ['saved_table', 'name', source.normalizedName];
}

function buildDocumentKey(
  workspaceScope: WorkspaceScope | null,
  tab: WorkspaceTab | undefined,
  state: PersistedState,
) {
  return JSON.stringify([
    workspaceScope ? getWorkspaceScopeStorageKey(workspaceScope) : null,
    tab?.id ?? null,
    tab ? getDocumentSourceIdentity(tab.source) : null,
    buildSchemaStateSignature(state),
  ]);
}

interface UseSchemaControllerParams {
  domains: EditorDomains;
  hydrated: boolean;
  isShareView: boolean;
  workspaceScope: WorkspaceScope | null;
  loadedTableId: string | null;
  loadedTableNormalizedName: string | null;
  loadedTableName: string | null;
  loadedTableSignature: string | null;
  loadedTableState: PersistedState | null;
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
  loadedTableState,
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
    loadedTableState,
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
  const activeWorkspaceTab = useTabStore((state) =>
    state.tabs.find((tab) => tab.id === state.activeTabId),
  );
  const getCurrentDocumentKey = () =>
    buildDocumentKey(
      workspaceScope,
      useTabStore.getState().getActiveTab(),
      derived.buildPersistedState(),
    );
  const documentKey = buildDocumentKey(
    workspaceScope,
    activeWorkspaceTab,
    derived.currentPersistedState,
  );
  const aiCommentActions = useAICommentActions({
    documentKey,
    getCurrentDocumentKey,
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
    getCurrentDocumentKey,
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
      reviewActions.reviewState.setReviewResult(
        result,
        buildDocumentKey(workspaceScope, useTabStore.getState().getActiveTab(), state),
      ),
  };
  const schemaLintIssues = useMemo(
    () =>
      lintSchema({
        tableName,
        rows,
        indexes,
        foreignKeys,
        mysqlPartitionConfig,
        citusShardingConfig,
        tableMiscConfig,
      }),
    [
      citusShardingConfig,
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
