import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { AISchemaPatchPanel } from './AISchemaPatchPanel';
import { AIIndexAdvisorDialog } from './AIIndexAdvisorDialog';
import { DialogRenderGuard } from './containers/DialogRenderGuard';
import { GlobalDialogs } from './containers/GlobalDialogs';
import type { AppDialogLayerModel } from './useAppController';

const ImportSqlDialog = lazy(() =>
  import('@/components/ImportSqlDialog').then((module) => ({
    default: module.ImportSqlDialog,
  })),
);

interface AppDialogLayerProps {
  model: AppDialogLayerModel;
  isImportDialogOpen: boolean;
  setIsImportDialogOpen: (open: boolean) => void;
  isErDialogOpen: boolean;
  setIsErDialogOpen: (open: boolean) => void;
  isAISchemaPatchOpen: boolean;
  setIsAISchemaPatchOpen: (open: boolean) => void;
}

export function AppDialogLayer({
  model,
  isImportDialogOpen,
  setIsImportDialogOpen,
  isErDialogOpen,
  setIsErDialogOpen,
  isAISchemaPatchOpen,
  setIsAISchemaPatchOpen,
}: AppDialogLayerProps) {
  const { actions, domains, resources, workspace, schema, dialogs } = model;
  const { t } = useTranslation();
  const { editor } = domains;
  const { savedTableData, folderData, fieldTemplateData, tableTemplateData } = resources;
  const { folderActions, templateActions, savedTableFlow, tableTemplateActions, trashActions } =
    actions;
  const { aiPatchFlow, schemaActions, clearActions, indexAdvisor } = actions;
  const objectLabel = t(
    editor.objectType === 'view'
      ? 'dialogs.save.objectLabels.view'
      : 'dialogs.save.objectLabels.table',
  );

  return (
    <>
      <GlobalDialogs
        clearDialog={{
          onCancel: clearActions.cancelClearAll,
          onConfirm: clearActions.confirmClearAll,
        }}
        saveDialog={{
          open: editor.isSaveDialogOpen,
          onOpenChange: savedTableFlow.handleSaveDialogOpenChange,
          title: t(
            schema.hasLoadedTable ? 'dialogs.save.updateTitle' : 'dialogs.save.createTitle',
            { object: objectLabel },
          ),
          description: t(
            schema.hasLoadedTable
              ? 'dialogs.save.updateDescription'
              : 'dialogs.save.createDescription',
            { object: objectLabel },
          ),
          name: dialogs.saveName,
          onNameChange: dialogs.handleSaveNameChange,
          error: dialogs.saveError,
          inputDisabled: dialogs.saveInputDisabled,
          canSaveCurrent: schema.canSaveCurrent,
          onConfirm: savedTableFlow.handleConfirmSave,
        }}
        renameDialog={{
          open: editor.isRenameDialogOpen,
          onOpenChange: savedTableFlow.handleRenameDialogOpenChange,
          name: dialogs.renameName,
          onNameChange: dialogs.handleRenameNameChange,
          error: dialogs.renameError,
          onConfirm: savedTableFlow.handleConfirmRename,
        }}
        deleteDialog={{
          open: editor.isDeleteDialogOpen,
          onOpenChange: savedTableFlow.handleDeleteDialogOpenChange,
          targetName: dialogs.deleteTarget?.name,
          onConfirm: savedTableFlow.handleConfirmDelete,
        }}
        folderDialogProps={{
          open: folderActions.isFolderDialogOpen,
          onOpenChange: folderActions.setIsFolderDialogOpen,
          mode: folderActions.folderDialogMode,
          parentFolder: folderActions.folderDialogParent,
          targetFolder: folderActions.folderDialogTarget,
          onConfirm: folderActions.handleFolderDialogConfirm,
        }}
        deleteFolderDialogProps={{
          open: folderActions.isDeleteFolderDialogOpen,
          onOpenChange: folderActions.setIsDeleteFolderDialogOpen,
          folder: folderActions.deleteFolderTarget,
          tableCount: folderActions.deleteFolderTableCount,
          onConfirm: folderActions.handleDeleteFolderConfirm,
        }}
        templateManagerDialogProps={{
          open: templateActions.isTemplateManagerOpen,
          onOpenChange: templateActions.setIsTemplateManagerOpen,
          templates: fieldTemplateData.templates,
          loading: fieldTemplateData.loading,
          onCreateTemplate: fieldTemplateData.create,
          onUpdateTemplate: fieldTemplateData.update,
          onDuplicateTemplate: fieldTemplateData.duplicate,
          onDeleteTemplate: fieldTemplateData.remove,
        }}
        createTemplateDialogProps={{
          open: templateActions.isCreateTemplateDialogOpen,
          onOpenChange: templateActions.setIsCreateTemplateDialogOpen,
          selectedFields: templateActions.selectedFieldsForTemplate,
          onConfirm: templateActions.handleCreateTemplateFromFields,
        }}
        tableTemplateManagerDialogProps={{
          open: tableTemplateActions.isManagerOpen,
          onOpenChange: tableTemplateActions.setIsManagerOpen,
          templates: tableTemplateData.templates,
          loading: tableTemplateData.loading,
          onRenameTemplate: tableTemplateData.rename,
          onDuplicateTemplate: tableTemplateData.duplicate,
          onDeleteTemplate: tableTemplateData.remove,
        }}
        createTableTemplateDialogProps={{
          open: tableTemplateActions.isCreateDialogOpen,
          onOpenChange: tableTemplateActions.setIsCreateDialogOpen,
          blueprint: tableTemplateActions.pendingBlueprint,
          onConfirm: tableTemplateActions.handleCreateTemplate,
        }}
        diffDialogProps={{
          tableName: editor.tableName,
          dbType: editor.dbType,
          diff: schema.tableDiff,
          fields: schema.normalizedFields,
          onCopy: dialogs.handleCopyDiff,
        }}
        versionHistoryDialogProps={{
          currentState: schema.currentPersistedState,
          onRollback: dialogs.handleRollbackVersion,
        }}
        reviewHistoryDialogProps={{
          tableNormalizedName: workspace.loadedTableNormalizedName,
        }}
        aiGenerateDialogProps={{
          dbType: editor.dbType,
          existingConfig: schema.aiGenerateExistingConfig,
          templates: schema.aiGenerateTemplates,
          onApply: schemaActions.handleApplyAIGeneratedSchema,
        }}
        storageEstimatorDialogProps={{
          dbType: editor.dbType,
          fields: schema.normalizedFields,
          indexes: editor.indexes,
          storageFormat: schema.storageFormat,
        }}
        mockDataDialogProps={{
          tableName: editor.tableName,
          schemaName: editor.schemaName,
          dbType: editor.dbType,
          fields: schema.normalizedFields,
        }}
        erDiagramDialogProps={{
          open: isErDialogOpen,
          onOpenChange: setIsErDialogOpen,
          onSelectTable: dialogs.handleSelectTableFromEr,
          saveTable: savedTableData.saveTable,
          workspaceScope: workspace.workspaceScope,
        }}
        emptyTrashDialog={{
          open: trashActions.isEmptyTrashDialogOpen,
          onOpenChange: trashActions.setIsEmptyTrashDialogOpen,
          onConfirm: trashActions.handleConfirmEmptyTrash,
        }}
      />

      <DialogRenderGuard open={isAISchemaPatchOpen}>
        <Dialog open={isAISchemaPatchOpen} onOpenChange={setIsAISchemaPatchOpen}>
          <DialogContent className="flex max-h-[88vh] w-[min(1080px,calc(100vw-2rem))] max-w-none flex-col overflow-hidden p-0">
            <DialogTitle className="sr-only">{t('aiPatch.title')}</DialogTitle>
            <AISchemaPatchPanel
              dbType={editor.dbType}
              currentState={schema.currentPersistedState}
              templates={[...fieldTemplateData.templates, ...tableTemplateData.templates]}
              onApplyChanges={aiPatchFlow.applyChanges}
              onFocusChange={aiPatchFlow.focusChange}
            />
          </DialogContent>
        </Dialog>
      </DialogRenderGuard>

      <DialogRenderGuard open={indexAdvisor.open}>
        <AIIndexAdvisorDialog
          open={indexAdvisor.open}
          onOpenChange={indexAdvisor.setDialogOpen}
          isLoading={indexAdvisor.isLoading}
          result={indexAdvisor.result}
          error={indexAdvisor.error}
          suggestedQuery={indexAdvisor.suggestedQuery}
          blockingMessage={indexAdvisor.blockingMessage}
          onAnalyze={indexAdvisor.analyze}
          onApplyIndex={indexAdvisor.applyRecommendation}
        />
      </DialogRenderGuard>

      {!workspace.isShareView && (
        <Suspense fallback={null}>
          <DialogRenderGuard open={isImportDialogOpen}>
            <ImportSqlDialog
              currentDbType={editor.dbType}
              onImport={schemaActions.handleImport}
              open={isImportDialogOpen}
              onOpenChange={setIsImportDialogOpen}
              hideTrigger
              savedTables={savedTableData.savedTables}
              folderTree={folderData.folderTree}
              onBatchImport={savedTableData.importTables}
            />
          </DialogRenderGuard>
        </Suspense>
      )}
    </>
  );
}
