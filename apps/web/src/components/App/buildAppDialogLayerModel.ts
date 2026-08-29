import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildQualifiedTableName } from '@ddlbuilder/ddl-core';
import type { useFieldTemplates } from '@/hooks/useFieldTemplates';
import type { useTableTemplates } from '@/hooks/useTableTemplates';
import type { useWebMcpTools } from '@/webmcp/useWebMcpTools';
import type { useAISchemaPatchFlow } from './hooks/useAISchemaPatchFlow';
import type { useClearAllActions } from './hooks/useClearAllActions';
import type { useDialogStates } from './hooks/useDialogStates';
import type { useEditorDomains } from './hooks/useEditorDomains';
import type { useFolderActions } from './hooks/useFolderActions';
import type { useSavedTableFlowActions } from './hooks/useSavedTableFlowActions';
import type { useSchemaApplyActions } from './hooks/useSchemaApplyActions';
import type { useSchemaController } from './hooks/useSchemaController';
import type { useTableTemplateActions } from './hooks/useTableTemplateActions';
import type { useTemplateActions } from './hooks/useTemplateActions';
import type { useWorkspaceController } from './hooks/useWorkspaceController';
import type { useWorkspaceTrashActions } from './hooks/useWorkspaceTrashActions';

type EditorDomains = ReturnType<typeof useEditorDomains>;
type WorkspaceController = ReturnType<typeof useWorkspaceController>;
type SchemaController = ReturnType<typeof useSchemaController>;
type FieldTemplateData = ReturnType<typeof useFieldTemplates>;
type TableTemplateData = ReturnType<typeof useTableTemplates>;

interface BuildAppDialogLayerModelParams {
  domains: EditorDomains;
  workspaceController: WorkspaceController;
  schemaController: SchemaController;
  webMcpDialog: ReturnType<typeof useWebMcpTools>;
  folderActions: ReturnType<typeof useFolderActions>;
  templateActions: ReturnType<typeof useTemplateActions>;
  clearActions: ReturnType<typeof useClearAllActions>;
  savedTableFlow: ReturnType<typeof useSavedTableFlowActions>;
  tableTemplateActions: ReturnType<typeof useTableTemplateActions>;
  trashActions: ReturnType<typeof useWorkspaceTrashActions>;
  aiPatchFlow: ReturnType<typeof useAISchemaPatchFlow>;
  schemaActions: ReturnType<typeof useSchemaApplyActions>;
  fieldTemplateData: FieldTemplateData;
  tableTemplateData: TableTemplateData;
  dialogStates: ReturnType<typeof useDialogStates>;
  aiGenerateExistingConfig: Pick<
    PersistedState,
    'schemaName' | 'tableName' | 'tableComment' | 'rows' | 'indexes'
  >;
  aiGenerateTemplates: Array<
    FieldTemplateData['templates'][number] | TableTemplateData['templates'][number]
  >;
  handleCopyDiff: () => void;
  onBatchImportComplete: () => void;
  handleRollbackVersion: (state: PersistedState) => void;
  handleSelectTableFromEr: (state: PersistedState) => void;
}

export function buildAppDialogLayerModel({
  domains,
  workspaceController,
  schemaController,
  webMcpDialog,
  folderActions,
  templateActions,
  clearActions,
  savedTableFlow,
  tableTemplateActions,
  trashActions,
  aiPatchFlow,
  schemaActions,
  fieldTemplateData,
  tableTemplateData,
  dialogStates,
  aiGenerateExistingConfig,
  aiGenerateTemplates,
  onBatchImportComplete,
  handleCopyDiff,
  handleRollbackVersion,
  handleSelectTableFromEr,
}: BuildAppDialogLayerModelParams) {
  const { editor, ui, tableOptions } = domains;
  const { persistenceStatus, tables, folders, scope: workspaceScope } = workspaceController;
  const { derived, indexAdvisor } = schemaController;
  const versionTarget =
    ui.versionHistoryTarget && workspaceScope
      ? {
          scope: workspaceScope,
          tableId: ui.versionHistoryTarget.tableId,
          normalizedName: ui.versionHistoryTarget.normalizedName,
        }
      : null;
  const timelineTarget =
    ui.timelinePlayerTarget && workspaceScope
      ? {
          scope: workspaceScope,
          tableId: ui.timelinePlayerTarget.tableId,
          normalizedName: ui.timelinePlayerTarget.normalizedName,
        }
      : null;

  return {
    webMcpDialog,
    userSettings: { open: ui.isUserSettingsOpen, onOpenChange: ui.setIsUserSettingsOpen },
    saveObjectType: editor.objectType,
    saveDialogIsUpdate: derived.hasLoadedTable,
    globalDialogs: {
      clearDialog: {
        open: ui.isClearDialogOpen,
        onOpenChange: ui.setIsClearDialogOpen,
        onCancel: clearActions.cancelClearAll,
        onConfirm: clearActions.confirmClearAll,
      },
      saveDialog: {
        open: ui.isSaveDialogOpen,
        onOpenChange: savedTableFlow.handleSaveDialogOpenChange,
        name: dialogStates.saveName,
        onNameChange: dialogStates.handleSaveNameChange,
        error: dialogStates.saveError,
        inputDisabled: derived.saveInputDisabled,
        canSaveCurrent: derived.canSaveCurrent,
        onConfirm: savedTableFlow.handleConfirmSave,
      },
      renameDialog: {
        open: ui.isRenameDialogOpen,
        onOpenChange: savedTableFlow.handleRenameDialogOpenChange,
        name: dialogStates.renameName,
        onNameChange: dialogStates.handleRenameNameChange,
        error: dialogStates.renameError,
        onConfirm: savedTableFlow.handleConfirmRename,
      },
      deleteDialog: {
        open: ui.isDeleteDialogOpen,
        onOpenChange: savedTableFlow.handleDeleteDialogOpenChange,
        targetName: dialogStates.deleteTarget?.name,
        onConfirm: savedTableFlow.handleConfirmDelete,
      },
      folderDialogProps: {
        open: folderActions.isFolderDialogOpen,
        onOpenChange: folderActions.setIsFolderDialogOpen,
        mode: folderActions.folderDialogMode,
        parentFolder: folderActions.folderDialogParent,
        targetFolder: folderActions.folderDialogTarget,
        onConfirm: folderActions.handleFolderDialogConfirm,
      },
      deleteFolderDialogProps: {
        open: folderActions.isDeleteFolderDialogOpen,
        onOpenChange: folderActions.setIsDeleteFolderDialogOpen,
        folder: folderActions.deleteFolderTarget,
        tableCount: folderActions.deleteFolderTableCount,
        onConfirm: folderActions.handleDeleteFolderConfirm,
      },
      templateManagerDialogProps: {
        open: templateActions.isTemplateManagerOpen,
        onOpenChange: templateActions.setIsTemplateManagerOpen,
        templates: fieldTemplateData.templates,
        loading: fieldTemplateData.loading,
        onCreateTemplate: fieldTemplateData.create,
        onUpdateTemplate: fieldTemplateData.update,
        onDuplicateTemplate: fieldTemplateData.duplicate,
        onDeleteTemplate: fieldTemplateData.remove,
      },
      createTemplateDialogProps: {
        open: templateActions.isCreateTemplateDialogOpen,
        onOpenChange: templateActions.setIsCreateTemplateDialogOpen,
        selectedFields: templateActions.selectedFieldsForTemplate,
        onConfirm: templateActions.handleCreateTemplateFromFields,
      },
      tableTemplateManagerDialogProps: {
        open: tableTemplateActions.isManagerOpen,
        onOpenChange: tableTemplateActions.setIsManagerOpen,
        templates: tableTemplateData.templates,
        loading: tableTemplateData.loading,
        onRenameTemplate: tableTemplateData.rename,
        onDuplicateTemplate: tableTemplateData.duplicate,
        onDeleteTemplate: tableTemplateData.remove,
      },
      createTableTemplateDialogProps: {
        open: tableTemplateActions.isCreateDialogOpen,
        onOpenChange: tableTemplateActions.setIsCreateDialogOpen,
        blueprint: tableTemplateActions.pendingBlueprint,
        onConfirm: tableTemplateActions.handleCreateTemplate,
      },
      diffDialogProps: {
        open: ui.isDiffDialogOpen,
        onOpenChange: ui.setIsDiffDialogOpen,
        tableName: buildQualifiedTableName(editor.schemaName, editor.tableName),
        dbType: editor.dbType,
        diff: derived.tableDiff,
        fields: derived.normalizedFields,
        onCopy: handleCopyDiff,
      },
      versionHistoryDialogProps:
        versionTarget && ui.versionHistoryTarget
          ? {
              open: true,
              onOpenChange: (open: boolean) => {
                if (!open) ui.setVersionHistoryTarget(null);
              },
              target: versionTarget,
              tableName: ui.versionHistoryTarget.name,
              onRollback: handleRollbackVersion,
              onPlayTimeline: () => ui.setTimelinePlayerTarget(ui.versionHistoryTarget),
            }
          : null,
      timelinePlayerProps:
        timelineTarget && ui.timelinePlayerTarget
          ? {
              open: true,
              onOpenChange: (open: boolean) => {
                if (!open) ui.setTimelinePlayerTarget(null);
              },
              target: timelineTarget,
              tableName: ui.timelinePlayerTarget.name,
            }
          : null,
      reviewHistoryDialogProps: {
        open: ui.isReviewHistoryOpen,
        onOpenChange: ui.setIsReviewHistoryOpen,
        target: schemaController.reviewActions.reviewTarget,
      },
      aiGenerateDialogProps: {
        open: ui.isAIGenerateDialogOpen,
        onOpenChange: ui.setIsAIGenerateDialogOpen,
        dbType: editor.dbType,
        existingConfig: aiGenerateExistingConfig,
        templates: aiGenerateTemplates,
        onApply: schemaActions.handleApplyAIGeneratedSchema,
      },
      storageEstimatorDialogProps: {
        open: ui.isStorageEstimatorOpen,
        onOpenChange: ui.setIsStorageEstimatorOpen,
        dbType: editor.dbType,
        fields: derived.normalizedFields,
        indexes: editor.indexes,
        storageFormat: tableOptions.tableMiscConfig.storedAs || undefined,
      },
      mockDataDialogProps: {
        open: ui.isMockDataDialogOpen,
        onOpenChange: ui.setIsMockDataDialogOpen,
        tableName: editor.tableName,
        schemaName: editor.schemaName,
        dbType: editor.dbType,
        fields: derived.normalizedFields,
      },
      erDiagramDialogProps: {
        open: ui.isErDialogOpen,
        onOpenChange: ui.setIsErDialogOpen,
        onSelectTable: handleSelectTableFromEr,
        saveTable: tables.saveTable,
        overwriteTable: tables.overwriteTable,
        loadTables: tables.loadTables,
      },
      emptyTrashDialog: {
        open: trashActions.isEmptyTrashDialogOpen,
        onOpenChange: trashActions.setIsEmptyTrashDialogOpen,
        onConfirm: trashActions.handleConfirmEmptyTrash,
      },
    },
    aiPatch: {
      open: ui.isAISchemaPatchOpen,
      onOpenChange: ui.setIsAISchemaPatchOpen,
      currentState: derived.currentPersistedState,
      templates: aiGenerateTemplates,
      onApplyChanges: aiPatchFlow.applyChanges,
      onFocusChange: aiPatchFlow.focusChange,
    },
    indexAdvisor: {
      open: indexAdvisor.open,
      onOpenChange: indexAdvisor.setDialogOpen,
      isLoading: indexAdvisor.isLoading,
      result: indexAdvisor.result,
      error: indexAdvisor.error,
      suggestedQuery: indexAdvisor.suggestedQuery,
      blockingMessage: indexAdvisor.blockingMessage,
      onAnalyze: indexAdvisor.analyze,
      onApplyIndex: indexAdvisor.applyRecommendation,
    },
    importDialog: {
      visible: !persistenceStatus.isShareView && ui.isImportDialogOpen,
      currentDbType: editor.dbType,
      onImport: schemaActions.handleImport,
      open: ui.isImportDialogOpen,
      onOpenChange: ui.setIsImportDialogOpen,
      savedTables: tables.savedTables,
      folderTree: folders.folderTree,
      onBatchImport: tables.importTables,
      onBatchImportComplete,
    },
  };
}

export type AppDialogLayerModel = ReturnType<typeof buildAppDialogLayerModel>;
