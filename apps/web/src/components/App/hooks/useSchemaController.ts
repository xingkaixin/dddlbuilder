import {
  type SavedTableTarget,
  type WorkspaceScope,
  type WorkspaceSelection,
} from '@ddlbuilder/shared-types/workspace';
import { useCallback, useMemo } from 'react';
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

function buildDocumentIdentityKey(
  workspaceScope: WorkspaceScope | null,
  tab: WorkspaceTab | undefined,
) {
  return JSON.stringify([
    workspaceScope ? getWorkspaceScopeStorageKey(workspaceScope) : null,
    tab?.id ?? null,
    tab ? getDocumentSourceIdentity(tab.source) : null,
  ]);
}

function buildDocumentKey(
  workspaceScope: WorkspaceScope | null,
  tab: WorkspaceTab | undefined,
  state: PersistedState,
) {
  return JSON.stringify([
    buildDocumentIdentityKey(workspaceScope, tab),
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
    indexes,
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
  const { buildPersistedState, currentPersistedState } = derived;

  const getCurrentDocumentKey = useCallback(
    () =>
      buildDocumentKey(
        workspaceScope,
        useTabStore.getState().getActiveTab(),
        buildPersistedState(),
      ),
    [buildPersistedState, workspaceScope],
  );
  const documentKey = useMemo(
    () => buildDocumentKey(workspaceScope, activeWorkspaceTab, currentPersistedState),
    [workspaceScope, activeWorkspaceTab, currentPersistedState],
  );
  const aiCommentActions = useAICommentActions({ documentKey, getCurrentDocumentKey });

  const getCurrentDocumentIdentityKey = useCallback(
    () => buildDocumentIdentityKey(workspaceScope, useTabStore.getState().getActiveTab()),
    [workspaceScope],
  );
  const indexAdvisor = useIndexAdvisorFlow({
    documentKey: buildDocumentIdentityKey(workspaceScope, activeWorkspaceTab),
    getCurrentDocumentKey: getCurrentDocumentIdentityKey,
    dbType,
    schemaName,
    tableName,
    tableComment,
    fields: derived.normalizedFields,
    indexes,
  });
  const reviewActions = useReviewActions({
    documentKey,
    getCurrentDocumentKey,
    dbType,
    tableName: qualifiedTableName,
    generatedSql: sql.generatedSql,
    workspaceScope,
    loadedTableId,
    draftId:
      activeWorkspaceTab?.source.kind === 'draft' ? activeWorkspaceTab.source.draftId : undefined,
    loadedTableNormalizedName,
    setIsReviewHistoryOpen,
  });
  const { setReviewResult: setDocumentReviewResult } = reviewActions.reviewState;

  const setReviewResult = useCallback(
    (result: DDLReviewResult | null, state: PersistedState) =>
      setDocumentReviewResult(
        result,
        buildDocumentKey(workspaceScope, useTabStore.getState().getActiveTab(), state),
      ),
    [setDocumentReviewResult, workspaceScope],
  );
  const reviewState = { ...reviewActions.reviewState, setReviewResult };

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
    buildPersistedState,
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
