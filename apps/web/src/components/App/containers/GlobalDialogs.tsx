import { useCallback, type ComponentProps, type ElementType } from 'react';
import { AlertTriangle, Trash2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NamePromptDialog } from './NamePromptDialog';
import { AIGenerateDialog } from '../AIGenerateDialog';
import { DiffDialog } from '../DiffDialog';
import { DeleteFolderDialog, FolderDialog } from '../FolderDialogs';
import { MockDataDialog } from '../MockDataDialog';
import { ReviewHistoryDialog } from '../ReviewHistoryDialog';
import { ErDiagramDialog } from '../ErDiagramDialog';
import { StorageEstimatorDialog } from '../StorageEstimatorDialog';
import { TemplateManagerDialog } from '../TemplateManagerDialog';
import { TableTemplateManagerDialog } from '../TableTemplateManagerDialog';
import { CreateTableTemplateDialog } from '../CreateTableTemplateDialog';
import { CreateTemplateDialog } from '../CreateTemplateDialog';
import { VersionHistoryDialog } from '../VersionHistoryDialog';
import { SchemaTimelinePlayer } from '../SchemaTimelinePlayer';
import { useTranslation } from 'react-i18next';
import { useEditorStore } from '@/stores';

type ControlledDialogProps<T extends ElementType> = Omit<
  ComponentProps<T>,
  'open' | 'onOpenChange'
>;

interface GlobalDialogsProps {
  clearDialog: {
    onCancel: () => void;
    onConfirm: () => void;
  };
  saveDialog: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    name: string;
    onNameChange: (value: string) => void;
    error: string;
    inputDisabled: boolean;
    canSaveCurrent: boolean;
    onConfirm: () => void;
  };
  renameDialog: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    name: string;
    onNameChange: (value: string) => void;
    error: string;
    onConfirm: () => void;
  };
  deleteDialog: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    targetName?: string;
    onConfirm: () => void;
  };
  folderDialogProps: ComponentProps<typeof FolderDialog>;
  deleteFolderDialogProps: ComponentProps<typeof DeleteFolderDialog>;
  templateManagerDialogProps: ComponentProps<typeof TemplateManagerDialog>;
  createTemplateDialogProps: ComponentProps<typeof CreateTemplateDialog>;
  tableTemplateManagerDialogProps: ComponentProps<typeof TableTemplateManagerDialog>;
  createTableTemplateDialogProps: ComponentProps<typeof CreateTableTemplateDialog>;
  diffDialogProps: ControlledDialogProps<typeof DiffDialog>;
  versionHistoryDialogProps: Omit<
    ControlledDialogProps<typeof VersionHistoryDialog>,
    'tableNormalizedName' | 'tableName' | 'onPlayTimeline'
  >;
  reviewHistoryDialogProps: ControlledDialogProps<typeof ReviewHistoryDialog>;
  aiGenerateDialogProps: ControlledDialogProps<typeof AIGenerateDialog>;
  storageEstimatorDialogProps: ControlledDialogProps<typeof StorageEstimatorDialog>;
  mockDataDialogProps: ControlledDialogProps<typeof MockDataDialog>;
  erDiagramDialogProps: ComponentProps<typeof ErDiagramDialog>;
  emptyTrashDialog: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
  };
}

export function GlobalDialogs({
  clearDialog,
  saveDialog,
  renameDialog,
  deleteDialog,
  folderDialogProps,
  deleteFolderDialogProps,
  templateManagerDialogProps,
  createTemplateDialogProps,
  tableTemplateManagerDialogProps,
  createTableTemplateDialogProps,
  diffDialogProps,
  versionHistoryDialogProps,
  reviewHistoryDialogProps,
  aiGenerateDialogProps,
  storageEstimatorDialogProps,
  mockDataDialogProps,
  erDiagramDialogProps,
  emptyTrashDialog,
}: GlobalDialogsProps) {
  const { t } = useTranslation();
  const isClearDialogOpen = useEditorStore((state) => state.isClearDialogOpen);
  const isDiffDialogOpen = useEditorStore((state) => state.isDiffDialogOpen);
  const versionHistoryTarget = useEditorStore((state) => state.versionHistoryTarget);
  const timelinePlayerTarget = useEditorStore((state) => state.timelinePlayerTarget);
  const isReviewHistoryOpen = useEditorStore((state) => state.isReviewHistoryOpen);
  const isAIGenerateDialogOpen = useEditorStore((state) => state.isAIGenerateDialogOpen);
  const isStorageEstimatorOpen = useEditorStore((state) => state.isStorageEstimatorOpen);
  const isMockDataDialogOpen = useEditorStore((state) => state.isMockDataDialogOpen);
  const {
    setIsClearDialogOpen,
    setIsDiffDialogOpen,
    setVersionHistoryTarget,
    setTimelinePlayerTarget,
    setIsReviewHistoryOpen,
    setIsAIGenerateDialogOpen,
    setIsStorageEstimatorOpen,
    setIsMockDataDialogOpen,
  } = useEditorStore.getState();

  const handlePlayTimeline = useCallback(() => {
    if (versionHistoryTarget) {
      setTimelinePlayerTarget(versionHistoryTarget);
    }
  }, [setTimelinePlayerTarget, versionHistoryTarget]);

  const handleVersionHistoryOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setVersionHistoryTarget(null);
      }
    },
    [setVersionHistoryTarget],
  );

  const handleTimelinePlayerOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setTimelinePlayerTarget(null);
      }
    },
    [setTimelinePlayerTarget],
  );

  return (
    <>
      {folderDialogProps.open && <FolderDialog {...folderDialogProps} />}
      {deleteFolderDialogProps.open && <DeleteFolderDialog {...deleteFolderDialogProps} />}
      {templateManagerDialogProps.open && <TemplateManagerDialog {...templateManagerDialogProps} />}
      {createTemplateDialogProps.open && <CreateTemplateDialog {...createTemplateDialogProps} />}
      {tableTemplateManagerDialogProps.open && (
        <TableTemplateManagerDialog {...tableTemplateManagerDialogProps} />
      )}
      {createTableTemplateDialogProps.open && (
        <CreateTableTemplateDialog {...createTableTemplateDialogProps} />
      )}
      {isDiffDialogOpen && (
        <DiffDialog
          {...diffDialogProps}
          open={isDiffDialogOpen}
          onOpenChange={setIsDiffDialogOpen}
        />
      )}
      {versionHistoryTarget && (
        <VersionHistoryDialog
          {...versionHistoryDialogProps}
          open
          onOpenChange={handleVersionHistoryOpenChange}
          tableNormalizedName={versionHistoryTarget.normalizedName}
          tableName={versionHistoryTarget.name}
          onPlayTimeline={handlePlayTimeline}
        />
      )}
      {timelinePlayerTarget && (
        <SchemaTimelinePlayer
          open
          onOpenChange={handleTimelinePlayerOpenChange}
          tableNormalizedName={timelinePlayerTarget.normalizedName}
          tableName={timelinePlayerTarget.name}
        />
      )}
      {isReviewHistoryOpen && (
        <ReviewHistoryDialog
          {...reviewHistoryDialogProps}
          open={isReviewHistoryOpen}
          onOpenChange={setIsReviewHistoryOpen}
        />
      )}
      {isAIGenerateDialogOpen && (
        <AIGenerateDialog
          {...aiGenerateDialogProps}
          open={isAIGenerateDialogOpen}
          onOpenChange={setIsAIGenerateDialogOpen}
        />
      )}

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('dialogs.clear.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.clear.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={clearDialog.onCancel}>
              {t('dialogs.clear.cancel')}
            </Button>
            <Button variant="destructive" onClick={clearDialog.onConfirm}>
              {t('dialogs.clear.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NamePromptDialog
        open={saveDialog.open}
        onOpenChange={saveDialog.onOpenChange}
        idPrefix="save-table"
        title={saveDialog.title}
        description={saveDialog.description}
        label={t('dialogs.save.name')}
        placeholder={t('dialogs.save.placeholder')}
        value={saveDialog.name}
        onValueChange={saveDialog.onNameChange}
        error={saveDialog.error}
        disabledHint={saveDialog.inputDisabled ? t('dialogs.save.loadedHint') : null}
        cancelLabel={t('dialogs.save.cancel')}
        confirmLabel={t('dialogs.save.confirm')}
        confirmDisabled={!saveDialog.canSaveCurrent}
        onConfirm={saveDialog.onConfirm}
      />

      <NamePromptDialog
        open={renameDialog.open}
        onOpenChange={renameDialog.onOpenChange}
        idPrefix="rename-table"
        title={t('dialogs.rename.title')}
        description={t('dialogs.rename.description')}
        label={t('dialogs.rename.newName')}
        placeholder={t('dialogs.rename.placeholder')}
        value={renameDialog.name}
        onValueChange={renameDialog.onNameChange}
        error={renameDialog.error}
        cancelLabel={t('dialogs.rename.cancel')}
        confirmLabel={t('dialogs.rename.confirm')}
        onConfirm={renameDialog.onConfirm}
      />

      <Dialog open={deleteDialog.open} onOpenChange={deleteDialog.onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              {t('dialogs.delete.title')}
            </DialogTitle>
            <DialogDescription>
              {deleteDialog.targetName
                ? t('dialogs.delete.descriptionWithName', {
                    name: deleteDialog.targetName,
                  })
                : t('dialogs.delete.descriptionFallback')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => deleteDialog.onOpenChange(false)}>
              {t('dialogs.delete.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={deleteDialog.onConfirm}
              aria-describedby="delete-warning"
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('dialogs.delete.confirm')}
            </Button>
          </DialogFooter>
          <p id="delete-warning" className="sr-only">
            {t('dialogs.delete.descriptionFallback')}
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={emptyTrashDialog.open} onOpenChange={emptyTrashDialog.onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              {t('savedTables.emptyTrash')}
            </DialogTitle>
            <DialogDescription>{t('savedTables.emptyTrashConfirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => emptyTrashDialog.onOpenChange(false)}>
              {t('dialogs.delete.cancel')}
            </Button>
            <Button variant="destructive" onClick={emptyTrashDialog.onConfirm}>
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {t('savedTables.emptyTrash')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isStorageEstimatorOpen && (
        <StorageEstimatorDialog
          {...storageEstimatorDialogProps}
          open={isStorageEstimatorOpen}
          onOpenChange={setIsStorageEstimatorOpen}
        />
      )}
      {isMockDataDialogOpen && (
        <MockDataDialog
          {...mockDataDialogProps}
          open={isMockDataDialogOpen}
          onOpenChange={setIsMockDataDialogOpen}
        />
      )}
      {erDiagramDialogProps.open && <ErDiagramDialog {...erDiagramDialogProps} />}
    </>
  );
}
