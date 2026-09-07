import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Upload } from '@/components/icons';
import { isCnyFireworksEnabled } from '@/config/featureFlags';
import type { EditorContentView, EditorView } from '@/stores/appUiStore';
import { WorkspaceSplitToggle } from './WorkspaceSplitToggle';
import { EditorSurface } from './EditorSurface';
import { Header } from './Header';
import { MainWorkspaceSkeleton } from './MainWorkspaceSkeleton';
import { SavedTablesDrawer } from './SavedTablesDrawer';
import { TabBar } from './TabBar';
import { TableTemplatePopover } from './TableTemplatePopover';
import { WorkspaceEmptyState } from './WorkspaceEmptyState';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { AppWorkspaceModel } from './buildAppWorkspaceModel';

const FireworksOverlay = lazy(() => import('@/components/FireworksOverlay'));

interface AppWorkspaceProps {
  model: AppWorkspaceModel;
}

export function AppWorkspace({ model }: AppWorkspaceProps) {
  const {
    header,
    drawer,
    sidebar,
    tabBar,
    emptyState,
    tableTemplates,
    view,
    editorSurface,
    celebration,
  } = model;
  const { t } = useTranslation();
  const [shareView, setShareView] = useState<EditorContentView>('output');
  const [splitPreview, setSplitPreview] = useState(false);
  const contentView = view.isShareView ? shareView : editorSurface.editorView;
  const selectContentView = view.isShareView ? setShareView : editorSurface.setEditorView;
  const surfaceModel = {
    ...editorSurface,
    editorView: splitPreview ? ('split' as const) : contentView,
    setEditorView: (nextView: EditorView) => {
      setSplitPreview(nextView === 'split');
      if (nextView !== 'split') selectContentView(nextView);
    },
  };
  const splitToggle =
    !view.shouldShowWorkspaceSkeleton && (view.hasTabs || view.isShareView) ? (
      <WorkspaceSplitToggle checked={splitPreview} onCheckedChange={setSplitPreview} />
    ) : null;

  return (
    <>
      <Header
        {...header}
        onPlayFireworks={isCnyFireworksEnabled ? celebration.handlePlayFireworks : undefined}
      />

      {view.isShareView && (
        <div className="mx-3 mt-3 flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300 sm:flex-row sm:items-center sm:justify-between">
          <p>{t('app.shareBanner')}</p>
          <button
            type="button"
            onClick={view.openSaveDialog}
            className="inline-flex shrink-0 items-center justify-center rounded-md border border-amber-500/40 bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:border-amber-600 dark:bg-amber-900/50 dark:text-amber-100 dark:hover:bg-amber-900"
          >
            {t('app.saveAsCopy')}
          </button>
        </div>
      )}

      {isCnyFireworksEnabled && view.showFireworks && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] bg-black/70" />}>
          <FireworksOverlay onComplete={celebration.handleFireworksComplete} />
        </Suspense>
      )}

      <SavedTablesDrawer {...drawer} />

      <div className="relative flex min-h-0 flex-1 flex-row">
        {!view.isShareView && view.workspaceSidebarOpen && <WorkspaceSidebar {...sidebar} />}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="workspace-content">
          {!view.isShareView && (
            <TabBar
              leadingAction={
                !view.workspaceSidebarOpen ? (
                  <button
                    type="button"
                    className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={view.expandSidebar}
                    aria-label={t('savedTables.expand')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                ) : undefined
              }
              trailingAction={splitToggle}
              {...tabBar}
            />
          )}
          {view.isShareView && splitToggle && (
            <div className="flex shrink-0 justify-end border-b bg-muted/20 px-2 py-1">
              {splitToggle}
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col overflow-auto">
            {view.shouldShowWorkspaceSkeleton ? (
              <div className="p-3 sm:p-4">
                <MainWorkspaceSkeleton />
              </div>
            ) : !view.hasTabs && !view.isShareView ? (
              <WorkspaceEmptyState
                {...emptyState}
                importButton={
                  <button
                    type="button"
                    onClick={view.openImportDialog}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Upload className="h-4 w-4" />
                    {t('emptyState.importDDL')}
                  </button>
                }
                templateButton={
                  <TableTemplatePopover
                    {...tableTemplates}
                    triggerClassName="inline-flex h-9 items-center justify-center gap-2 rounded-lg border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  />
                }
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <EditorSurface model={surfaceModel} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
