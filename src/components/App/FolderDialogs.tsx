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
        setError('请输入文件夹名称');
        return;
      }
      setLoading(true);
      try {
        await onConfirm(trimmed);
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : '操作失败');
      } finally {
        setLoading(false);
      }
    }, [name, onConfirm, onOpenChange]);

    const title = mode === 'create' ? '新建文件夹' : '重命名文件夹';
    const description =
      mode === 'create'
        ? parentFolder
          ? `在「${parentFolder.name}」下创建子文件夹`
          : '创建根级文件夹'
        : `重命名「${targetFolder?.name}」`;

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">文件夹名称</Label>
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
                placeholder="请输入名称"
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? '处理中...' : '确定'}
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
            <AlertDialogTitle>删除文件夹</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除文件夹「{folder.name}」吗？
              {hasContent && (
                <>
                  <br />
                  <span className="text-amber-600">
                    该文件夹
                    {tableCount > 0 && `包含 ${tableCount} 个表`}
                    {tableCount > 0 && folder.children.length > 0 && '和'}
                    {folder.children.length > 0 &&
                      `${folder.children.length} 个子文件夹`}
                    ，删除后它们将被移到「未分组」。
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={loading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {loading ? '删除中...' : '确定删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  },
);
DeleteFolderDialog.displayName = 'DeleteFolderDialog';
