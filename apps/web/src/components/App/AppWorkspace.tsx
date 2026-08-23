import { lazy, Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Upload } from '@/components/icons';
import { isCnyFireworksEnabled } from '@/config/featureFlags';
import { EditorSurface } from './EditorSurface';
import { Header } from './Header';
import { MainWorkspaceSkeleton } from './MainWorkspaceSkeleton';
import { SavedTablesDrawer } from './SavedTablesDrawer';
import { TabBar } from './TabBar';
import { TableTemplatePopover } from './TableTemplatePopover';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { AppWorkspaceModel } from './appViewModel';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));

type AppWorkspaceProps = AppWorkspaceModel & {
  workspaceSidebarOpen: boolean;
  setWorkspaceSidebarOpen: (open: boolean) => void;
  outputPanelOpen: boolean;
  setOutputPanelOpen: (open: boolean) => void;
  onOpenImport: () => void;
  onOpenErDiagram: () => void;
  onOpenAISchemaPatch: () => void;
};

export function AppWorkspace({
  actions,
  domains,
  resources,
  workspace,
  schema,
  output,
  celebration,
  workspaceSidebarOpen,
  setWorkspaceSidebarOpen,
  outputPanelOpen,
  setOutputPanelOpen,
  onOpenImport,
  onOpenErDiagram,
  onOpenAISchemaPatch,
}: AppWorkspaceProps) {
  const { t } = useTranslation();
  const { editor } = domains;
  const { setSavedTablesDrawerOpen } = editor;
  const { savedTableData, folderData, tableTemplateData } = resources;
  const { savedTables, trashedTables, loading, error, importTables } = savedTableData;
  const {
    folderActions,
    shareAction,
    savedTableFlow,
    workspaceTabs,
    tableTemplateActions,
    trashActions,
    schemaActions,
    navigationActions,
  } = actions;
  const collapseSidebar = useCallback(
    () => setWorkspaceSidebarOpen(false),
    [setWorkspaceSidebarOpen],
  );
  const expandSidebar = useCallback(() => setWorkspaceSidebarOpen(true), [setWorkspaceSidebarOpen]);
  const openWorkspaceAfterImport = useCallback(
    () => setSavedTablesDrawerOpen(true),
    [setSavedTablesDrawerOpen],
  );

  return (
    <>
      <Header
        onShare={shareAction.handleShare}
        isSharing={shareAction.isSharing}
        currentDbType={editor.dbType}
        onImport={schemaActions.handleImport}
        onPlayFireworks={isCnyFireworksEnabled ? celebration.handlePlayFireworks : undefined}
        savedTables={savedTables}
        folderTree={folderData.folderTree}
        onBatchImportComplete={openWorkspaceAfterImport}
        onBatchImport={importTables}
        onOpenAIGenerate={navigationActions.handleOpenAIGenerateDialog}
      />

      {workspace.isShareView && (
        <div className="mx-3 mt-3 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('app.shareBanner')}</p>
          <button
            type="button"
            onClick={savedTableFlow.handleOpenSaveDialog}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900"
          >
            {t('app.saveAsCopy')}
          </button>
        </div>
      )}

      {isCnyFireworksEnabled && editor.showFireworks && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] bg-black/70" />}>
          <FireworksOverlay onComplete={celebration.handleFireworksComplete} />
        </Suspense>
      )}

      <SavedTablesDrawer
        open={editor.savedTablesDrawerOpen}
        onOpenChange={editor.setSavedTablesDrawerOpen}
        loading={loading}
        error={error}
        items={savedTables}
        draftItems={workspace.draftSummaries}
        activeDraftId={
          !workspace.isShareView && workspace.activeSource.kind === 'draft'
            ? workspace.activeSource.draftId
            : null
        }
        folders={folderData.folderTree}
        foldersLoading={folderData.loading}
        activeNormalizedName={workspace.loadedTableNormalizedName}
        activeDirty={workspace.isLoadedDirty}
        tablePresentations={workspace.tablePresentations}
        onSelectDraft={workspaceTabs.handleSelectDraft}
        onDeleteDraft={workspaceTabs.handleDeleteDraft}
        onSelect={workspaceTabs.handleSelectSavedTable}
        onRename={savedTableFlow.handleOpenRenameDialog}
        onDelete={savedTableFlow.handleOpenDeleteDialog}
        onViewHistory={navigationActions.handleViewVersionHistory}
        onMoveToFolder={folderActions.handleMoveTableToFolder}
        onMoveFolder={folderActions.handleMoveFolderToFolder}
        onCreateFolder={folderActions.handleOpenCreateFolderDialog}
        onRenameFolder={folderActions.handleOpenRenameFolderDialog}
        onDeleteFolder={folderActions.handleOpenDeleteFolderDialog}
      />

      <div className="flex flex-col sm:flex-row">
        {!workspace.isShareView && workspaceSidebarOpen && (
          <WorkspaceSidebar
            loading={loading || folderData.loading}
            error={error}
            items={savedTables}
            trashedItems={trashedTables}
            trashedDraftItems={workspace.trashedDrafts}
            draftItems={workspace.draftSummaries}
            folders={folderData.folderTree}
            activeNormalizedName={workspace.loadedTableNormalizedName}
            activeDraftId={
              workspace.activeSource.kind === 'draft' ? workspace.activeSource.draftId : null
            }
            activeDirty={workspace.isLoadedDirty}
            tablePresentations={workspace.tablePresentations}
            onCollapse={collapseSidebar}
            onOpenWorkspace={navigationActions.handleOpenSavedTablesDrawer}
            onCreateFolder={folderActions.handleOpenCreateFolderDialog}
            onSelectDraft={workspaceTabs.handleSelectDraft}
            onDeleteDraft={workspaceTabs.handleDeleteDraft}
            onMoveDraftToFolder={workspace.moveDraftToFolder}
            onSelect={workspaceTabs.handleSelectSavedTable}
            onRename={savedTableFlow.handleOpenRenameDialog}
            onDelete={savedTableFlow.handleOpenDeleteDialog}
            onRestore={trashActions.handleRestoreTable}
            onDeletePermanently={trashActions.handleDeleteTablePermanently}
            onRestoreDraft={trashActions.handleRestoreDraft}
            onDeleteDraftPermanently={trashActions.handleDeleteDraftPermanently}
            onEmptyTrash={trashActions.handleEmptyTrash}
            onMoveToFolder={folderActions.handleMoveTableToFolder}
            onMoveFolder={folderActions.handleMoveFolderToFolder}
            onRenameFolder={folderActions.handleOpenRenameFolderDialog}
            onDeleteFolder={folderActions.handleOpenDeleteFolderDialog}
            onViewHistory={navigationActions.handleViewVersionHistory}
          />
        )}

        <div className="min-w-0 flex-1" data-testid="workspace-content">
          {!workspace.isShareView && (
            <TabBar
              leadingAction={
                !workspaceSidebarOpen ? (
                  <button
                    type="button"
                    className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={expandSidebar}
                    aria-label={t('savedTables.expand')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : undefined
              }
              tabs={workspace.presentedTabs}
              activeTabId={workspace.activeTabId}
              onActivateTab={workspace.switchToTabById}
              onCloseTab={workspace.handleCloseTab}
              onCreateTab={workspaceTabs.handleCreateDraft}
            />
          )}
          <div className="p-3 sm:p-4">
            {workspace.shouldShowWorkspaceSkeleton ? (
              <MainWorkspaceSkeleton />
            ) : workspace.tabs.length === 0 && !workspace.isShareView ? (
              <WorkspaceEmptyState
                hasContent={workspace.draftSummaries.length > 0 || savedTables.length > 0}
                recentDrafts={workspace.recentDrafts}
                recentTables={workspace.recentTables}
                onCreateNewTable={workspaceTabs.handleCreateDraft}
                onOpenDraft={workspaceTabs.handleSelectDraft}
                onOpenTable={workspaceTabs.handleSelectSavedTable}
                onLoadExample={workspaceTabs.handleLoadExample}
                importButton={
                  <button
                    type="button"
                    onClick={onOpenImport}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Upload className="h-4 w-4" />
                    {t('emptyState.importDDL')}
                  </button>
                }
                templateButton={
                  <TableTemplatePopover
                    templates={tableTemplateData.templates}
                    loading={tableTemplateData.loading}
                    onApplyTemplate={tableTemplateActions.handleApplyTemplate}
                    onManageTemplates={tableTemplateActions.handleManageTemplates}
                    onSaveAsTemplate={tableTemplateActions.handleSaveAsTemplate}
                    triggerClassName="inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  />
                }
              />
            ) : (
              <EditorSurface
                actions={actions}
                domains={domains}
                workspace={workspace}
                schema={schema}
                output={output}
                outputPanelOpen={outputPanelOpen}
                setOutputPanelOpen={setOutputPanelOpen}
                onOpenErDiagram={onOpenErDiagram}
                onOpenAISchemaPatch={onOpenAISchemaPatch}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
