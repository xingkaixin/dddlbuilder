import type { PersistedState } from '@ddlbuilder/shared-types';
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
  handleCopyDiff,
  handleRollbackVersion,
  handleSelectTableFromEr,
}: BuildAppDialogLayerModelParams) {
  const { editor, ui, tableOptions } = domains;
  const { persistence, savedTableData, folderData, loadedTableNormalizedName } =
    workspaceController;
  const { derived, indexAdvisor } = schemaController;

  return {
    webMcpDialog,
    actions: {
      indexAdvisor: {
        open: indexAdvisor.open,
        setDialogOpen: indexAdvisor.setDialogOpen,
        isLoading: indexAdvisor.isLoading,
        result: indexAdvisor.result,
        error: indexAdvisor.error,
        suggestedQuery: indexAdvisor.suggestedQuery,
        blockingMessage: indexAdvisor.blockingMessage,
        analyze: indexAdvisor.analyze,
        applyRecommendation: indexAdvisor.applyRecommendation,
      },
      folderActions: {
        isFolderDialogOpen: folderActions.isFolderDialogOpen,
        setIsFolderDialogOpen: folderActions.setIsFolderDialogOpen,
        folderDialogMode: folderActions.folderDialogMode,
        folderDialogParent: folderActions.folderDialogParent,
        folderDialogTarget: folderActions.folderDialogTarget,
        handleFolderDialogConfirm: folderActions.handleFolderDialogConfirm,
        isDeleteFolderDialogOpen: folderActions.isDeleteFolderDialogOpen,
        setIsDeleteFolderDialogOpen: folderActions.setIsDeleteFolderDialogOpen,
        deleteFolderTarget: folderActions.deleteFolderTarget,
        deleteFolderTableCount: folderActions.deleteFolderTableCount,
        handleDeleteFolderConfirm: folderActions.handleDeleteFolderConfirm,
      },
      templateActions: {
        isTemplateManagerOpen: templateActions.isTemplateManagerOpen,
        setIsTemplateManagerOpen: templateActions.setIsTemplateManagerOpen,
        isCreateTemplateDialogOpen: templateActions.isCreateTemplateDialogOpen,
        setIsCreateTemplateDialogOpen: templateActions.setIsCreateTemplateDialogOpen,
        selectedFieldsForTemplate: templateActions.selectedFieldsForTemplate,
        handleCreateTemplateFromFields: templateActions.handleCreateTemplateFromFields,
      },
      clearActions: {
        cancelClearAll: clearActions.cancelClearAll,
        confirmClearAll: clearActions.confirmClearAll,
      },
      savedTableFlow: {
        handleSaveDialogOpenChange: savedTableFlow.handleSaveDialogOpenChange,
        handleConfirmSave: savedTableFlow.handleConfirmSave,
        handleRenameDialogOpenChange: savedTableFlow.handleRenameDialogOpenChange,
        handleConfirmRename: savedTableFlow.handleConfirmRename,
        handleDeleteDialogOpenChange: savedTableFlow.handleDeleteDialogOpenChange,
        handleConfirmDelete: savedTableFlow.handleConfirmDelete,
      },
      tableTemplateActions: {
        isManagerOpen: tableTemplateActions.isManagerOpen,
        setIsManagerOpen: tableTemplateActions.setIsManagerOpen,
        isCreateDialogOpen: tableTemplateActions.isCreateDialogOpen,
        setIsCreateDialogOpen: tableTemplateActions.setIsCreateDialogOpen,
        pendingBlueprint: tableTemplateActions.pendingBlueprint,
        handleCreateTemplate: tableTemplateActions.handleCreateTemplate,
      },
      trashActions: {
        isEmptyTrashDialogOpen: trashActions.isEmptyTrashDialogOpen,
        setIsEmptyTrashDialogOpen: trashActions.setIsEmptyTrashDialogOpen,
        handleConfirmEmptyTrash: trashActions.handleConfirmEmptyTrash,
      },
      aiPatchFlow: {
        applyChanges: aiPatchFlow.applyChanges,
        focusChange: aiPatchFlow.focusChange,
      },
      schemaActions: {
        handleApplyAIGeneratedSchema: schemaActions.handleApplyAIGeneratedSchema,
        handleImport: schemaActions.handleImport,
      },
    },
    domains: {
      editor: {
        dbType: editor.dbType,
        indexes: editor.indexes,
        objectType: editor.objectType,
        schemaName: editor.schemaName,
        tableName: editor.tableName,
      },
      ui: {
        isClearDialogOpen: ui.isClearDialogOpen,
        setIsClearDialogOpen: ui.setIsClearDialogOpen,
        isSaveDialogOpen: ui.isSaveDialogOpen,
        isRenameDialogOpen: ui.isRenameDialogOpen,
        isDeleteDialogOpen: ui.isDeleteDialogOpen,
        isDiffDialogOpen: ui.isDiffDialogOpen,
        setIsDiffDialogOpen: ui.setIsDiffDialogOpen,
        versionHistoryTarget: ui.versionHistoryTarget,
        setVersionHistoryTarget: ui.setVersionHistoryTarget,
        timelinePlayerTarget: ui.timelinePlayerTarget,
        setTimelinePlayerTarget: ui.setTimelinePlayerTarget,
        isReviewHistoryOpen: ui.isReviewHistoryOpen,
        setIsReviewHistoryOpen: ui.setIsReviewHistoryOpen,
        isAIGenerateDialogOpen: ui.isAIGenerateDialogOpen,
        setIsAIGenerateDialogOpen: ui.setIsAIGenerateDialogOpen,
        isStorageEstimatorOpen: ui.isStorageEstimatorOpen,
        setIsStorageEstimatorOpen: ui.setIsStorageEstimatorOpen,
        isMockDataDialogOpen: ui.isMockDataDialogOpen,
        setIsMockDataDialogOpen: ui.setIsMockDataDialogOpen,
      },
    },
    visibility: {
      isImportDialogOpen: ui.isImportDialogOpen,
      setIsImportDialogOpen: ui.setIsImportDialogOpen,
      isErDialogOpen: ui.isErDialogOpen,
      setIsErDialogOpen: ui.setIsErDialogOpen,
      isAISchemaPatchOpen: ui.isAISchemaPatchOpen,
      setIsAISchemaPatchOpen: ui.setIsAISchemaPatchOpen,
    },
    resources: {
      savedTableData: {
        importTables: savedTableData.importTables,
        loadTables: savedTableData.loadTables,
        overwriteTable: savedTableData.overwriteTable,
        saveTable: savedTableData.saveTable,
        savedTables: savedTableData.savedTables,
      },
      folderData: {
        folderTree: folderData.folderTree,
      },
      fieldTemplateData: {
        create: fieldTemplateData.create,
        duplicate: fieldTemplateData.duplicate,
        loading: fieldTemplateData.loading,
        remove: fieldTemplateData.remove,
        templates: fieldTemplateData.templates,
        update: fieldTemplateData.update,
      },
      tableTemplateData: {
        duplicate: tableTemplateData.duplicate,
        loading: tableTemplateData.loading,
        remove: tableTemplateData.remove,
        rename: tableTemplateData.rename,
        templates: tableTemplateData.templates,
      },
    },
    workspace: {
      scope: workspaceController.workspaceScope,
      loadedTableNormalizedName,
      isShareView: persistence.isShareView,
    },
    schema: {
      aiGenerateExistingConfig,
      aiGenerateTemplates,
      canSaveCurrent: derived.canSaveCurrent,
      currentPersistedState: derived.currentPersistedState,
      hasLoadedTable: derived.hasLoadedTable,
      normalizedFields: derived.normalizedFields,
      storageFormat: tableOptions.tableMiscConfig.storedAs || undefined,
      tableDiff: derived.tableDiff,
    },
    dialogs: {
      deleteTarget: dialogStates.deleteTarget,
      handleCopyDiff,
      handleRenameNameChange: dialogStates.handleRenameNameChange,
      handleRollbackVersion,
      handleSaveNameChange: dialogStates.handleSaveNameChange,
      handleSelectTableFromEr,
      renameError: dialogStates.renameError,
      renameName: dialogStates.renameName,
      saveError: dialogStates.saveError,
      saveInputDisabled: derived.saveInputDisabled,
      saveName: dialogStates.saveName,
    },
  };
}

export type AppDialogLayerModel = ReturnType<typeof buildAppDialogLayerModel>;
