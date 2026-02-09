import type { ComponentProps } from 'react';
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
import { ReviewHistoryDialog } from '../ReviewHistoryDialog';
import { StorageEstimatorDialog } from '../StorageEstimatorDialog';
import {
  CreateTemplateDialog,
  TemplateManagerDialog,
} from '../TemplateManagerDialog';
import { VersionHistoryDialog } from '../VersionHistoryDialog';

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
  loadConfirmDialog: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    pendingName?: string;
    canSaveCurrent: boolean;
    onCancel: () => void;
    onConfirmSave: () => void;
    onConfirmIgnore: () => void;
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
  diffDialogProps: ComponentProps<typeof DiffDialog>;
  versionHistoryDialogProps: ComponentProps<typeof VersionHistoryDialog>;
  reviewHistoryDialogProps: ComponentProps<typeof ReviewHistoryDialog>;
  aiGenerateDialogProps: ComponentProps<typeof AIGenerateDialog>;
  storageEstimatorDialogProps: ComponentProps<typeof StorageEstimatorDialog>;
  toastMessage: string;
}

export function GlobalDialogs({
  clearDialog,
  saveDialog,
  loadConfirmDialog,
  renameDialog,
  deleteDialog,
  folderDialogProps,
  deleteFolderDialogProps,
  templateManagerDialogProps,
  createTemplateDialogProps,
  diffDialogProps,
  versionHistoryDialogProps,
  reviewHistoryDialogProps,
  aiGenerateDialogProps,
  storageEstimatorDialogProps,
  toastMessage,
}: GlobalDialogsProps) {
  return (
    <>
      <FolderDialog {...folderDialogProps} />
      <DeleteFolderDialog {...deleteFolderDialogProps} />
      <TemplateManagerDialog {...templateManagerDialogProps} />
      <CreateTemplateDialog {...createTemplateDialogProps} />
      <DiffDialog {...diffDialogProps} />
      <VersionHistoryDialog {...versionHistoryDialogProps} />
      <ReviewHistoryDialog {...reviewHistoryDialogProps} />
      <AIGenerateDialog {...aiGenerateDialogProps} />

      <Dialog open={clearDialog.open} onOpenChange={clearDialog.onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认清空所有配置？</DialogTitle>
            <DialogDescription>
              此操作将移除当前填写的表信息、字段、索引及授权配置，且无法撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={clearDialog.onCancel}>
              取消
            </Button>
            <Button variant="destructive" onClick={clearDialog.onConfirm}>
              确认清空
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
            <Label htmlFor="save-table-name">保存名称</Label>
            <Input
              id="save-table-name"
              value={saveDialog.name}
              onChange={(event) => {
                saveDialog.onNameChange(event.target.value);
              }}
              placeholder="例如：用户表"
              disabled={saveDialog.inputDisabled}
            />
            {saveDialog.inputDisabled && (
              <p className="text-xs text-muted-foreground">
                已加载表仅支持覆盖保存，如需更名请在左侧列表重命名。
              </p>
            )}
            {saveDialog.error && (
              <p className="text-xs text-destructive">{saveDialog.error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => saveDialog.onOpenChange(false)}
            >
              取消
            </Button>
            <Button
              onClick={saveDialog.onConfirm}
              disabled={!saveDialog.canSaveCurrent}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={loadConfirmDialog.open}
        onOpenChange={loadConfirmDialog.onOpenChange}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>加载保存的表</DialogTitle>
            <DialogDescription>
              {loadConfirmDialog.pendingName
                ? `加载「${loadConfirmDialog.pendingName}」将覆盖当前内容。`
                : '加载将覆盖当前内容。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pr-2">
            <Button variant="outline" onClick={loadConfirmDialog.onCancel}>
              取消
            </Button>
            <Button
              variant="secondary"
              onClick={loadConfirmDialog.onConfirmSave}
              disabled={!loadConfirmDialog.canSaveCurrent}
              title={
                !loadConfirmDialog.canSaveCurrent
                  ? '加载的表未修改，无法保存'
                  : undefined
              }
            >
              保存当前后加载
            </Button>
            <Button
              variant="destructive"
              onClick={loadConfirmDialog.onConfirmIgnore}
            >
              忽略当前并加载
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialog.open} onOpenChange={renameDialog.onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>重命名保存的表</DialogTitle>
            <DialogDescription>
              请输入新的名称，名称不可重复。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="rename-table-name">新名称</Label>
            <Input
              id="rename-table-name"
              value={renameDialog.name}
              onChange={(event) => {
                renameDialog.onNameChange(event.target.value);
              }}
              placeholder="例如：订单表"
            />
            {renameDialog.error && (
              <p className="text-xs text-destructive">{renameDialog.error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => renameDialog.onOpenChange(false)}
            >
              取消
            </Button>
            <Button onClick={renameDialog.onConfirm}>确认</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialog.open} onOpenChange={deleteDialog.onOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>确认删除保存的表？</DialogTitle>
            <DialogDescription>
              {deleteDialog.targetName
                ? `即将删除「${deleteDialog.targetName}」，此操作无法撤销。`
                : '此操作无法撤销。'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => deleteDialog.onOpenChange(false)}
            >
              取消
            </Button>
            <Button variant="destructive" onClick={deleteDialog.onConfirm}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toastMessage && (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 transform rounded-full bg-foreground/90 px-5 py-2.5 text-sm font-medium text-background shadow-xl transition-[opacity,transform] duration-300 animate-in fade-in zoom-in-95 slide-in-from-top-4 motion-reduce:animate-none motion-reduce:transition-none">
          {toastMessage}
        </div>
      )}

      <StorageEstimatorDialog {...storageEstimatorDialogProps} />
    </>
  );
}
