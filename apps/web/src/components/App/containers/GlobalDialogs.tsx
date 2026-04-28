import { useEffect, useRef, type ComponentProps } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
}: GlobalDialogsProps) {
  const { t } = useTranslation();
  const saveInputRef = useRef<HTMLInputElement>(null);
  const saveErrorRef = useRef<HTMLParagraphElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const renameErrorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (saveDialog.open && saveDialog.error) {
      const timer = window.setTimeout(() => {
        saveErrorRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [saveDialog.open, saveDialog.error]);

  useEffect(() => {
    if (renameDialog.open && renameDialog.error) {
      const timer = window.setTimeout(() => {
        renameErrorRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [renameDialog.open, renameDialog.error]);

  const saveDescriptionIds = [
    saveDialog.inputDisabled ? 'save-table-name-hint' : null,
    saveDialog.error ? 'save-table-name-error' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const renameDescriptionIds = [renameDialog.error ? 'rename-table-name-error' : null]
    .filter(Boolean)
    .join(' ');

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

      <Dialog open={saveDialog.open} onOpenChange={saveDialog.onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{saveDialog.title}</DialogTitle>
            <DialogDescription>{saveDialog.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="save-table-name">{t('dialogs.save.name')}</Label>
            <Input
              ref={saveInputRef}
              id="save-table-name"
              value={saveDialog.name}
              onChange={(event) => {
                saveDialog.onNameChange(event.target.value);
              }}
              placeholder={t('dialogs.save.placeholder')}
              disabled={saveDialog.inputDisabled}
              aria-describedby={saveDescriptionIds || undefined}
            />
            {saveDialog.inputDisabled && (
              <p id="save-table-name-hint" className="text-xs text-muted-foreground">
                {t('dialogs.save.loadedHint')}
              </p>
            )}
            {saveDialog.error && (
              <p
                id="save-table-name-error"
                ref={saveErrorRef}
                tabIndex={-1}
                role="alert"
                aria-live="assertive"
                className="text-xs text-destructive"
              >
                {saveDialog.error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => saveDialog.onOpenChange(false)}>
              {t('dialogs.save.cancel')}
            </Button>
            <Button onClick={saveDialog.onConfirm} disabled={!saveDialog.canSaveCurrent}>
              {t('dialogs.save.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialog.open} onOpenChange={renameDialog.onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('dialogs.rename.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.rename.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="rename-table-name">{t('dialogs.rename.newName')}</Label>
            <Input
              ref={renameInputRef}
              id="rename-table-name"
              value={renameDialog.name}
              onChange={(event) => {
                renameDialog.onNameChange(event.target.value);
              }}
              placeholder={t('dialogs.rename.placeholder')}
              aria-describedby={renameDescriptionIds || undefined}
            />
            {renameDialog.error && (
              <p
                id="rename-table-name-error"
                ref={renameErrorRef}
                tabIndex={-1}
                role="alert"
                aria-live="assertive"
                className="text-xs text-destructive"
              >
                {renameDialog.error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => renameDialog.onOpenChange(false)}>
              {t('dialogs.rename.cancel')}
            </Button>
            <Button onClick={renameDialog.onConfirm}>{t('dialogs.rename.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <StorageEstimatorDialog {...storageEstimatorDialogProps} />
      <MockDataDialog {...mockDataDialogProps} />
      <ErDiagramDialog {...erDiagramDialogProps} />
    </>
  );
}
