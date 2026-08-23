import type { AppController } from './useAppController';

export const toAppShellModel = (controller: AppController) => ({
  tabs: controller.workspace.tabs,
  isShareView: controller.workspace.isShareView,
  openAIGenerateDialog: controller.actions.navigationActions.handleOpenAIGenerateDialog,
});

export const toAppWorkspaceModel = (controller: AppController) => ({
  actions: {
    aiCommentActions: controller.actions.aiCommentActions,
    indexAdvisor: controller.actions.indexAdvisor,
    folderActions: controller.actions.folderActions,
    reviewActions: controller.actions.reviewActions,
    shareAction: controller.actions.shareAction,
    clearActions: controller.actions.clearActions,
    savedTableFlow: controller.actions.savedTableFlow,
    workspaceTabs: controller.actions.workspaceTabs,
    tableTemplateActions: controller.actions.tableTemplateActions,
    trashActions: controller.actions.trashActions,
    schemaActions: controller.actions.schemaActions,
    navigationActions: controller.actions.navigationActions,
  },
  domains: controller.domains,
  resources: {
    savedTableData: controller.resources.savedTableData,
    folderData: controller.resources.folderData,
    tableTemplateData: controller.resources.tableTemplateData,
  },
  workspace: {
    activeSource: controller.workspace.activeSource,
    activeTabId: controller.workspace.activeTabId,
    draftSummaries: controller.workspace.draftSummaries,
    handleCloseTab: controller.workspace.handleCloseTab,
    isLoadedDirty: controller.workspace.isLoadedDirty,
    isShareView: controller.workspace.isShareView,
    loadedTableName: controller.workspace.loadedTableName,
    loadedTableNormalizedName: controller.workspace.loadedTableNormalizedName,
    moveDraftToFolder: controller.workspace.moveDraftToFolder,
    presentedTabs: controller.workspace.presentedTabs,
    recentDrafts: controller.workspace.recentDrafts,
    recentTables: controller.workspace.recentTables,
    shouldShowWorkspaceSkeleton: controller.workspace.shouldShowWorkspaceSkeleton,
    switchToTabById: controller.workspace.switchToTabById,
    tablePresentations: controller.workspace.tablePresentations,
    tabs: controller.workspace.tabs,
    trashedDrafts: controller.workspace.trashedDrafts,
    workspaceLabel: controller.workspace.workspaceLabel,
  },
  schema: {
    availableFields: controller.schema.availableFields,
    canSaveCurrent: controller.schema.canSaveCurrent,
    dataTableToolbarLeft: controller.schema.dataTableToolbarLeft,
    filledRowCount: controller.schema.filledRowCount,
    handleDbTypeChange: controller.schema.handleDbTypeChange,
    handleSaveCurrent: controller.schema.handleSaveCurrent,
    handleTableNameChange: controller.schema.handleTableNameChange,
    handleViewCurrentVersionHistory: controller.schema.handleViewCurrentVersionHistory,
    qualifiedTableName: controller.schema.qualifiedTableName,
    schemaLintIssues: controller.schema.schemaLintIssues,
    tableDiff: controller.schema.tableDiff,
  },
  output: controller.output,
  celebration: controller.celebration,
});

export const toAppDialogModel = (controller: AppController) => ({
  actions: {
    indexAdvisor: controller.actions.indexAdvisor,
    folderActions: controller.actions.folderActions,
    templateActions: controller.actions.templateActions,
    clearActions: controller.actions.clearActions,
    savedTableFlow: controller.actions.savedTableFlow,
    tableTemplateActions: controller.actions.tableTemplateActions,
    trashActions: controller.actions.trashActions,
    aiPatchFlow: controller.actions.aiPatchFlow,
    schemaActions: controller.actions.schemaActions,
  },
  domains: {
    editor: controller.domains.editor,
    tableOptions: controller.domains.tableOptions,
  },
  resources: controller.resources,
  workspace: {
    loadedTableNormalizedName: controller.workspace.loadedTableNormalizedName,
    workspaceScope: controller.workspace.workspaceScope,
    isShareView: controller.workspace.isShareView,
  },
  schema: {
    aiGenerateExistingConfig: controller.schema.aiGenerateExistingConfig,
    aiGenerateTemplates: controller.schema.aiGenerateTemplates,
    canSaveCurrent: controller.schema.canSaveCurrent,
    currentPersistedState: controller.schema.currentPersistedState,
    normalizedFields: controller.schema.normalizedFields,
    tableDiff: controller.schema.tableDiff,
  },
  dialogs: controller.dialogs,
});

export type AppWorkspaceModel = ReturnType<typeof toAppWorkspaceModel>;
export type AppDialogModel = ReturnType<typeof toAppDialogModel>;
