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
  const activeDraftId =
    !persistence.isShareView && activeEditorSource.kind === 'draft'
      ? activeEditorSource.draftId
      : null;

  return {
    header: {
      onShare: shareAction.handleShare,
      isSharing: shareAction.isSharing,
      currentDbType: editor.dbType,
      onImport: schemaActions.handleImport,
      savedTables: savedTableData.savedTables,
      folderTree: folderData.folderTree,
      onBatchImportComplete: openWorkspaceAfterImport,
      onBatchImport: savedTableData.importTables,
      onOpenAIGenerate: navigationActions.handleOpenAIGenerateDialog,
    },
    drawer: {
      open: ui.savedTablesDrawerOpen,
      onOpenChange: ui.setSavedTablesDrawerOpen,
      loading: savedTableData.loading,
      error: savedTableData.error,
      items: savedTableData.savedTables,
      draftItems: persistence.draftSummaries,
      activeDraftId,
      folders: folderData.folderTree,
      foldersLoading: folderData.loading,
      activeNormalizedName: loadedTableNormalizedName,
      activeTableId: workspaceController.loadedTableSource?.tableId,
      activeDirty: isLoadedDirty,
      tablePresentations: workspacePresentation.tablePresentations,
      onSelectDraft: workspaceTabs.handleSelectDraft,
      onDeleteDraft: workspaceTabs.handleDeleteDraft,
      onSelect: workspaceTabs.handleSelectSavedTable,
      onRename: savedTableFlow.handleOpenRenameDialog,
      onDelete: savedTableFlow.handleOpenDeleteDialog,
      onViewHistory: navigationActions.handleViewVersionHistory,
      onMoveToFolder: folderActions.handleMoveTableToFolder,
      onMoveFolder: folderActions.handleMoveFolderToFolder,
      onCreateFolder: folderActions.handleOpenCreateFolderDialog,
      onRenameFolder: folderActions.handleOpenRenameFolderDialog,
      onDeleteFolder: folderActions.handleOpenDeleteFolderDialog,
    },
    sidebar: {
      loading: savedTableData.loading || folderData.loading,
      error: savedTableData.error,
      items: savedTableData.savedTables,
      trashedItems: savedTableData.trashedTables,
      trashedDraftItems: persistence.trashedDrafts,
      draftItems: persistence.draftSummaries,
      folders: folderData.folderTree,
      activeNormalizedName: loadedTableNormalizedName,
      activeTableId: workspaceController.loadedTableSource?.tableId,
      activeDraftId,
      activeDirty: isLoadedDirty,
      tablePresentations: workspacePresentation.tablePresentations,
      onCollapse: collapseSidebar,
      onOpenWorkspace: navigationActions.handleOpenSavedTablesDrawer,
      onCreateFolder: folderActions.handleOpenCreateFolderDialog,
      onSelectDraft: workspaceTabs.handleSelectDraft,
      onDeleteDraft: workspaceTabs.handleDeleteDraft,
      onMoveDraftToFolder: persistence.moveDraftToFolder,
      onSelect: workspaceTabs.handleSelectSavedTable,
      onRename: savedTableFlow.handleOpenRenameDialog,
      onDelete: savedTableFlow.handleOpenDeleteDialog,
      onRestore: trashActions.handleRestoreTable,
      onDeletePermanently: trashActions.handleDeleteTablePermanently,
      onRestoreDraft: trashActions.handleRestoreDraft,
      onDeleteDraftPermanently: trashActions.handleDeleteDraftPermanently,
      onEmptyTrash: trashActions.handleEmptyTrash,
      onMoveToFolder: folderActions.handleMoveTableToFolder,
      onMoveFolder: folderActions.handleMoveFolderToFolder,
      onRenameFolder: folderActions.handleOpenRenameFolderDialog,
      onDeleteFolder: folderActions.handleOpenDeleteFolderDialog,
      onViewHistory: navigationActions.handleViewVersionHistory,
    },
    tabBar: {
      activeTabId: tabLifecycle.activeTabId,
      tabs: workspacePresentation.presentedTabs,
      onActivateTab: tabLifecycle.switchToTabById,
      onCloseTab: tabLifecycle.closeTab,
      onCreateTab: workspaceTabs.handleCreateDraft,
    },
    emptyState: {
      hasContent: persistence.draftSummaries.length > 0 || savedTableData.savedTables.length > 0,
      recentDrafts: workspacePresentation.recentDrafts,
      recentTables: workspacePresentation.recentTables,
      onCreateNewTable: workspaceTabs.handleCreateDraft,
      onOpenDraft: workspaceTabs.handleSelectDraft,
      onOpenTable: workspaceTabs.handleSelectSavedTable,
      onLoadExample: workspaceTabs.handleLoadExample,
    },
    tableTemplates: {
      templates: tableTemplateData.templates,
      loading: tableTemplateData.loading,
      onApplyTemplate: tableTemplateActions.handleApplyTemplate,
      onManageTemplates: tableTemplateActions.handleManageTemplates,
      onSaveAsTemplate: tableTemplateActions.handleSaveAsTemplate,
    },
    view: {
      isShareView: persistence.isShareView,
      shouldShowWorkspaceSkeleton: workspacePresentation.shouldShowWorkspaceSkeleton,
      workspaceSidebarOpen: ui.workspaceSidebarOpen,
      hasTabs: tabLifecycle.tabs.length > 0,
      showFireworks: ui.showFireworks,
      openSaveDialog: savedTableFlow.handleOpenSaveDialog,
      expandSidebar,
      openImportDialog,
    },
    editorSurface,
    celebration: {
      handleFireworksComplete,
      handlePlayFireworks,
    },
  };
}

export type AppWorkspaceModel = ReturnType<typeof buildAppWorkspaceModel>;
