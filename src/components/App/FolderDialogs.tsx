import { memo, useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { FolderTreeNode } from '@/hooks/useFolders';
import { useTranslation } from 'react-i18next';

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'rename';
  parentFolder?: FolderTreeNode | null;
  targetFolder?: FolderTreeNode | null;
  onConfirm: (name: string) => Promise<void>;
}

export const FolderDialog = memo<FolderDialogProps>(
  ({ open, onOpenChange, mode, parentFolder, targetFolder, onConfirm }) => {
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Reset state when dialog opens
    useEffect(() => {
      if (open) {
        setName(mode === 'rename' && targetFolder ? targetFolder.name : '');
        setError('');
        setLoading(false);
      }
    }, [open, mode, targetFolder]);

    const handleConfirm = useCallback(async () => {
      const trimmed = name.trim();
      if (!trimmed) {
        setError(t('savedTables.folderDialog.nameRequired'));
        return;
      }
      setLoading(true);
      try {
        await onConfirm(trimmed);
        onOpenChange(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : t('savedTables.folderDialog.actionFailed'),
        );
      } finally {
        setLoading(false);
      }
    }, [name, onConfirm, onOpenChange, t]);

    const title =
      mode === 'create'
        ? t('savedTables.folderDialog.createTitle')
        : t('savedTables.folderDialog.renameTitle');
    const description =
      mode === 'create'
        ? parentFolder
          ? t('savedTables.folderDialog.createInParent', {
              name: parentFolder.name,
            })
          : t('savedTables.folderDialog.createRoot')
        : t('savedTables.folderDialog.renameDescription', {
            name: targetFolder?.name ?? '',
          });

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">
                {t('savedTables.folderDialog.nameLabel')}
              </Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirm();
                  }
                }}
                placeholder={t('savedTables.folderDialog.namePlaceholder')}
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('savedTables.folderDialog.cancel')}
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading
                ? t('savedTables.folderDialog.processing')
                : t('savedTables.folderDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  },
);
FolderDialog.displayName = 'FolderDialog';

interface DeleteFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: FolderTreeNode | null;
  tableCount: number;
  onConfirm: () => Promise<void>;
}

export const DeleteFolderDialog = memo<DeleteFolderDialogProps>(
  ({ open, onOpenChange, folder, tableCount, onConfirm }) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);

    const handleConfirm = useCallback(async () => {
      setLoading(true);
      try {
        await onConfirm();
        onOpenChange(false);
      } catch {
        // Error handling is done in parent
      } finally {
        setLoading(false);
      }
    }, [onConfirm, onOpenChange]);

    if (!folder) return null;

    const hasContent = tableCount > 0 || folder.children.length > 0;

    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTables.deleteFolderDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTables.deleteFolderDialog.description', {
                name: folder.name,
              })}
              {hasContent && (
                <>
                  <br />
                  <span className="text-amber-600">
                    {t('savedTables.deleteFolderDialog.contentPrefix')}
                    {tableCount > 0 &&
                      t('savedTables.deleteFolderDialog.containsTables', {
                        count: tableCount,
                      })}
                    {tableCount > 0 &&
                      folder.children.length > 0 &&
                      t('savedTables.deleteFolderDialog.and')}
                    {folder.children.length > 0 &&
                      t('savedTables.deleteFolderDialog.containsChildren', {
                        count: folder.children.length,
                      })}
                    {t('savedTables.deleteFolderDialog.contentSuffix')}
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>
              {t('savedTables.deleteFolderDialog.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading
                ? t('savedTables.deleteFolderDialog.deleting')
                : t('savedTables.deleteFolderDialog.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  },
);
DeleteFolderDialog.displayName = 'DeleteFolderDialog';
