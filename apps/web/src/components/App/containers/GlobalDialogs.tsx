import type { ComponentProps } from 'react';
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

interface GlobalDialogsProps {
  clearDialog: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
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
  diffDialogProps: ComponentProps<typeof DiffDialog>;
  versionHistoryDialogProps: ComponentProps<typeof VersionHistoryDialog>;
  timelinePlayerProps: ComponentProps<typeof SchemaTimelinePlayer>;
  reviewHistoryDialogProps: ComponentProps<typeof ReviewHistoryDialog>;
  aiGenerateDialogProps: ComponentProps<typeof AIGenerateDialog>;
  storageEstimatorDialogProps: ComponentProps<typeof StorageEstimatorDialog>;
  mockDataDialogProps: ComponentProps<typeof MockDataDialog>;
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
  timelinePlayerProps,
  reviewHistoryDialogProps,
  aiGenerateDialogProps,
  storageEstimatorDialogProps,
  mockDataDialogProps,
  erDiagramDialogProps,
  emptyTrashDialog,
}: GlobalDialogsProps) {
  const { t } = useTranslation();

  return (
    <>
      <FolderDialog {...folderDialogProps} />
      <DeleteFolderDialog {...deleteFolderDialogProps} />
      <TemplateManagerDialog {...templateManagerDialogProps} />
      <CreateTemplateDialog {...createTemplateDialogProps} />
      <TableTemplateManagerDialog {...tableTemplateManagerDialogProps} />
      <CreateTableTemplateDialog {...createTableTemplateDialogProps} />
      <DiffDialog {...diffDialogProps} />
      <VersionHistoryDialog {...versionHistoryDialogProps} />
      <SchemaTimelinePlayer {...timelinePlayerProps} />
      <ReviewHistoryDialog {...reviewHistoryDialogProps} />
      <AIGenerateDialog {...aiGenerateDialogProps} />

      <Dialog open={clearDialog.open} onOpenChange={clearDialog.onOpenChange}>
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

      <StorageEstimatorDialog {...storageEstimatorDialogProps} />
      <MockDataDialog {...mockDataDialogProps} />
      <ErDiagramDialog {...erDiagramDialogProps} />
    </>
  );
}
