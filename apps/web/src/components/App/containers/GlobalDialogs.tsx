import { lazy, Suspense, type ComponentProps } from 'react';
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
import { DeleteFolderDialog, FolderDialog } from '../FolderDialogs';
import type { AIGenerateDialog as AIGenerateDialogComponent } from '../AIGenerateDialog';
import type { DiffDialog as DiffDialogComponent } from '../DiffDialog';
import type { MockDataDialog as MockDataDialogComponent } from '../MockDataDialog';
import type { ReviewHistoryDialog as ReviewHistoryDialogComponent } from '../ReviewHistoryDialog';
import type { ErDiagramDialog as ErDiagramDialogComponent } from '../ErDiagramDialog';
import type { StorageEstimatorDialog as StorageEstimatorDialogComponent } from '../StorageEstimatorDialog';
import type { TemplateManagerDialog as TemplateManagerDialogComponent } from '../TemplateManagerDialog';
import type { TableTemplateManagerDialog as TableTemplateManagerDialogComponent } from '../TableTemplateManagerDialog';
import type { CreateTableTemplateDialog as CreateTableTemplateDialogComponent } from '../CreateTableTemplateDialog';
import type { CreateTemplateDialog as CreateTemplateDialogComponent } from '../CreateTemplateDialog';
import type { VersionHistoryDialog as VersionHistoryDialogComponent } from '../VersionHistoryDialog';
import type { SchemaTimelinePlayer as SchemaTimelinePlayerComponent } from '../SchemaTimelinePlayer';
import { useTranslation } from 'react-i18next';

const AIGenerateDialog = lazy(() =>
  import('../AIGenerateDialog').then((module) => ({ default: module.AIGenerateDialog })),
);
const DiffDialog = lazy(() =>
  import('../DiffDialog').then((module) => ({ default: module.DiffDialog })),
);
const MockDataDialog = lazy(() =>
  import('../MockDataDialog').then((module) => ({ default: module.MockDataDialog })),
);
const ReviewHistoryDialog = lazy(() =>
  import('../ReviewHistoryDialog').then((module) => ({ default: module.ReviewHistoryDialog })),
);
const ErDiagramDialog = lazy(() =>
  import('../ErDiagramDialog').then((module) => ({ default: module.ErDiagramDialog })),
);
const StorageEstimatorDialog = lazy(() =>
  import('../StorageEstimatorDialog').then((module) => ({
    default: module.StorageEstimatorDialog,
  })),
);
const TemplateManagerDialog = lazy(() =>
  import('../TemplateManagerDialog').then((module) => ({ default: module.TemplateManagerDialog })),
);
const TableTemplateManagerDialog = lazy(() =>
  import('../TableTemplateManagerDialog').then((module) => ({
    default: module.TableTemplateManagerDialog,
  })),
);
const CreateTableTemplateDialog = lazy(() =>
  import('../CreateTableTemplateDialog').then((module) => ({
    default: module.CreateTableTemplateDialog,
  })),
);
const CreateTemplateDialog = lazy(() =>
  import('../CreateTemplateDialog').then((module) => ({ default: module.CreateTemplateDialog })),
);
const VersionHistoryDialog = lazy(() =>
  import('../VersionHistoryDialog').then((module) => ({ default: module.VersionHistoryDialog })),
);
const SchemaTimelinePlayer = lazy(() =>
  import('../SchemaTimelinePlayer').then((module) => ({ default: module.SchemaTimelinePlayer })),
);

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
  templateManagerDialogProps: ComponentProps<typeof TemplateManagerDialogComponent>;
  createTemplateDialogProps: ComponentProps<typeof CreateTemplateDialogComponent>;
  tableTemplateManagerDialogProps: ComponentProps<typeof TableTemplateManagerDialogComponent>;
  createTableTemplateDialogProps: ComponentProps<typeof CreateTableTemplateDialogComponent>;
  diffDialogProps: ComponentProps<typeof DiffDialogComponent>;
  versionHistoryDialogProps: ComponentProps<typeof VersionHistoryDialogComponent> | null;
  timelinePlayerProps: ComponentProps<typeof SchemaTimelinePlayerComponent> | null;
  reviewHistoryDialogProps: ComponentProps<typeof ReviewHistoryDialogComponent>;
  aiGenerateDialogProps: ComponentProps<typeof AIGenerateDialogComponent>;
  storageEstimatorDialogProps: ComponentProps<typeof StorageEstimatorDialogComponent>;
  mockDataDialogProps: ComponentProps<typeof MockDataDialogComponent>;
  erDiagramDialogProps: ComponentProps<typeof ErDiagramDialogComponent>;
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
      {folderDialogProps.open && <FolderDialog {...folderDialogProps} />}
      {deleteFolderDialogProps.open && <DeleteFolderDialog {...deleteFolderDialogProps} />}
      {templateManagerDialogProps.open && (
        <Suspense fallback={null}>
          <TemplateManagerDialog {...templateManagerDialogProps} />
        </Suspense>
      )}
      {createTemplateDialogProps.open && (
        <Suspense fallback={null}>
          <CreateTemplateDialog {...createTemplateDialogProps} />
        </Suspense>
      )}
      {tableTemplateManagerDialogProps.open && (
        <Suspense fallback={null}>
          <TableTemplateManagerDialog {...tableTemplateManagerDialogProps} />
        </Suspense>
      )}
      {createTableTemplateDialogProps.open && (
        <Suspense fallback={null}>
          <CreateTableTemplateDialog {...createTableTemplateDialogProps} />
        </Suspense>
      )}
      {diffDialogProps.open && (
        <Suspense fallback={null}>
          <DiffDialog {...diffDialogProps} />
        </Suspense>
      )}
      {versionHistoryDialogProps && (
        <Suspense fallback={null}>
          <VersionHistoryDialog {...versionHistoryDialogProps} />
        </Suspense>
      )}
      {timelinePlayerProps && (
        <Suspense fallback={null}>
          <SchemaTimelinePlayer {...timelinePlayerProps} />
        </Suspense>
      )}
      {reviewHistoryDialogProps.open && (
        <Suspense fallback={null}>
          <ReviewHistoryDialog {...reviewHistoryDialogProps} />
        </Suspense>
      )}
      {aiGenerateDialogProps.open && (
        <Suspense fallback={null}>
          <AIGenerateDialog {...aiGenerateDialogProps} />
        </Suspense>
      )}

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

      {storageEstimatorDialogProps.open && storageEstimatorDialogProps.dbType !== 'sqlite' && (
        <Suspense fallback={null}>
          <StorageEstimatorDialog {...storageEstimatorDialogProps} />
        </Suspense>
      )}
      {mockDataDialogProps.open && (
        <Suspense fallback={null}>
          <MockDataDialog {...mockDataDialogProps} />
        </Suspense>
      )}
      {erDiagramDialogProps.open && (
        <Suspense fallback={null}>
          <ErDiagramDialog {...erDiagramDialogProps} />
        </Suspense>
      )}
    </>
  );
}
