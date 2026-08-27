import type { useEditorDomains } from './hooks/useEditorDomains';
import type { useEditorSurfaceModel } from './hooks/useEditorSurfaceModel';
import type { useFolderActions } from './hooks/useFolderActions';
import type { useNavigationActions } from './hooks/useNavigationActions';
import type { useSavedTableFlowActions } from './hooks/useSavedTableFlowActions';
import type { useSchemaApplyActions } from './hooks/useSchemaApplyActions';
import type { useSchemaController } from './hooks/useSchemaController';
import type { useTableTemplateActions } from './hooks/useTableTemplateActions';
import type { useTabLifecycle } from './hooks/useTabLifecycle';
import type { useWorkspaceController } from './hooks/useWorkspaceController';
import type { useWorkspacePresentation } from './hooks/useWorkspacePresentation';
import type { useWorkspaceTabActions } from './hooks/useWorkspaceTabActions';
import type { useWorkspaceTrashActions } from './hooks/useWorkspaceTrashActions';
import type { useTableTemplates } from '@/hooks/useTableTemplates';

type EditorDomains = ReturnType<typeof useEditorDomains>;
type WorkspaceController = ReturnType<typeof useWorkspaceController>;
type SchemaController = ReturnType<typeof useSchemaController>;
type TabLifecycle = ReturnType<typeof useTabLifecycle>;

interface BuildAppWorkspaceModelParams {
  domains: EditorDomains;
  workspaceController: WorkspaceController;
  tableTemplateData: ReturnType<typeof useTableTemplates>;
  schemaController: SchemaController;
  tabLifecycle: TabLifecycle;
  folderActions: ReturnType<typeof useFolderActions>;
  savedTableFlow: ReturnType<typeof useSavedTableFlowActions>;
  workspaceTabs: ReturnType<typeof useWorkspaceTabActions>;
  tableTemplateActions: ReturnType<typeof useTableTemplateActions>;
  trashActions: ReturnType<typeof useWorkspaceTrashActions>;
  schemaActions: ReturnType<typeof useSchemaApplyActions>;
  navigationActions: ReturnType<typeof useNavigationActions>;
  workspacePresentation: ReturnType<typeof useWorkspacePresentation>;
  editorSurface: ReturnType<typeof useEditorSurfaceModel>;
  activeEditorSource: WorkspaceController['persistence']['activeSource'];
  isLoadedDirty: boolean;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  openImportDialog: () => void;
  openWorkspaceAfterImport: () => void;
  handleFireworksComplete: () => void;
  handlePlayFireworks: () => void;
}

export function buildAppWorkspaceModel({
  domains,
  workspaceController,
  tableTemplateData,
  schemaController,
  tabLifecycle,
  folderActions,
  savedTableFlow,
  workspaceTabs,
  tableTemplateActions,
  trashActions,
  schemaActions,
  navigationActions,
  workspacePresentation,
  editorSurface,
  activeEditorSource,
  isLoadedDirty,
  collapseSidebar,
  expandSidebar,
  openImportDialog,
  openWorkspaceAfterImport,
  handleFireworksComplete,
  handlePlayFireworks,
}: BuildAppWorkspaceModelParams) {
  const { editor, ui } = domains;
  const { persistence, savedTableData, folderData, loadedTableNormalizedName } =
    workspaceController;
  const { shareAction } = schemaController;

  return {
    actions: {
      folderActions: {
        handleMoveTableToFolder: folderActions.handleMoveTableToFolder,
        handleMoveFolderToFolder: folderActions.handleMoveFolderToFolder,
        handleOpenCreateFolderDialog: folderActions.handleOpenCreateFolderDialog,
        handleOpenRenameFolderDialog: folderActions.handleOpenRenameFolderDialog,
        handleOpenDeleteFolderDialog: folderActions.handleOpenDeleteFolderDialog,
      },
      shareAction: {
        handleShare: shareAction.handleShare,
        isSharing: shareAction.isSharing,
      },
      savedTableFlow: {
        handleOpenSaveDialog: savedTableFlow.handleOpenSaveDialog,
        handleOpenRenameDialog: savedTableFlow.handleOpenRenameDialog,
        handleOpenDeleteDialog: savedTableFlow.handleOpenDeleteDialog,
      },
      workspaceTabs: {
        handleSelectDraft: workspaceTabs.handleSelectDraft,
        handleDeleteDraft: workspaceTabs.handleDeleteDraft,
        handleSelectSavedTable: workspaceTabs.handleSelectSavedTable,
        handleCreateDraft: workspaceTabs.handleCreateDraft,
        handleLoadExample: workspaceTabs.handleLoadExample,
      },
      tableTemplateActions: {
        handleApplyTemplate: tableTemplateActions.handleApplyTemplate,
        handleManageTemplates: tableTemplateActions.handleManageTemplates,
        handleSaveAsTemplate: tableTemplateActions.handleSaveAsTemplate,
      },
      trashActions: {
        handleRestoreTable: trashActions.handleRestoreTable,
        handleDeleteTablePermanently: trashActions.handleDeleteTablePermanently,
        handleRestoreDraft: trashActions.handleRestoreDraft,
        handleDeleteDraftPermanently: trashActions.handleDeleteDraftPermanently,
        handleEmptyTrash: trashActions.handleEmptyTrash,
      },
      schemaActions: {
        handleImport: schemaActions.handleImport,
      },
      navigationActions: {
        handleOpenAIGenerateDialog: navigationActions.handleOpenAIGenerateDialog,
        handleOpenSavedTablesDrawer: navigationActions.handleOpenSavedTablesDrawer,
        handleViewVersionHistory: navigationActions.handleViewVersionHistory,
      },
    },
    ui: {
      currentDbType: editor.dbType,
      savedTablesDrawerOpen: ui.savedTablesDrawerOpen,
      setSavedTablesDrawerOpen: ui.setSavedTablesDrawerOpen,
      showFireworks: ui.showFireworks,
    },
    resources: {
      savedTableData: {
        savedTables: savedTableData.savedTables,
        trashedTables: savedTableData.trashedTables,
        loading: savedTableData.loading,
        error: savedTableData.error,
        importTables: savedTableData.importTables,
      },
      folderData: {
        folderTree: folderData.folderTree,
        loading: folderData.loading,
      },
      tableTemplateData: {
        templates: tableTemplateData.templates,
        loading: tableTemplateData.loading,
      },
    },
    workspace: {
      activeSource: activeEditorSource,
      activeTabId: tabLifecycle.activeTabId,
      draftSummaries: persistence.draftSummaries,
      handleCloseTab: tabLifecycle.closeTab,
      isLoadedDirty,
      isShareView: persistence.isShareView,
      loadedTableNormalizedName,
      moveDraftToFolder: persistence.moveDraftToFolder,
      presentedTabs: workspacePresentation.presentedTabs,
      recentDrafts: workspacePresentation.recentDrafts,
      recentTables: workspacePresentation.recentTables,
      shouldShowWorkspaceSkeleton: workspacePresentation.shouldShowWorkspaceSkeleton,
      switchToTabById: tabLifecycle.switchToTabById,
      tablePresentations: workspacePresentation.tablePresentations,
      tabs: tabLifecycle.tabs,
      trashedDrafts: persistence.trashedDrafts,
    },
    layout: {
      workspaceSidebarOpen: ui.workspaceSidebarOpen,
      collapseSidebar,
      expandSidebar,
      openImportDialog,
      openWorkspaceAfterImport,
    },
    editorSurface,
    celebration: {
      handleFireworksComplete,
      handlePlayFireworks,
    },
  };
}

export type AppWorkspaceModel = ReturnType<typeof buildAppWorkspaceModel>;
