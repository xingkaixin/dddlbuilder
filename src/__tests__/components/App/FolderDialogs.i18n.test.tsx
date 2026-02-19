import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, userEvent } from '@/__tests__/utils/test-utils';
import type { MouseEvent, ReactNode } from 'react';
import {
  DeleteFolderDialog,
  FolderDialog,
} from '@/components/App/FolderDialogs';
import type { FolderTreeNode } from '@/hooks/useFolders';
import i18n from '@/i18n';

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/alert-dialog', () => ({
  AlertDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  AlertDialogAction: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: ReactNode;
    onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </button>
  ),
  AlertDialogCancel: ({
    children,
    disabled,
  }: {
    children: ReactNode;
    disabled?: boolean;
  }) => (
    <button type="button" disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const now = Date.now();

const targetFolder: FolderTreeNode = {
  id: 'folder-1',
  name: 'Archive',
  parentId: undefined,
  order: 1,
  createdAt: now,
  children: [
    {
      id: 'folder-1-1',
      name: 'Child',
      parentId: 'folder-1',
      order: 1,
      createdAt: now,
      children: [],
    },
  ],
};

describe('FolderDialogs i18n', () => {
  beforeEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en-US');
    });
  });

  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('zh-CN');
    });
  });

  it('新建文件夹弹窗在英文环境应显示英文文案', async () => {
    await act(async () => {
      render(
        <FolderDialog
          open
          onOpenChange={vi.fn()}
          mode="create"
          parentFolder={null}
          targetFolder={null}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    expect(screen.getByText('Create Folder')).toBeInTheDocument();
    expect(screen.getByText('Create root-level folder')).toBeInTheDocument();
    expect(screen.getByText('Folder Name')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Please enter a name'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(screen.getByText('Please enter folder name')).toBeInTheDocument();
  });

  it('重命名文件夹弹窗在英文环境应显示英文文案', async () => {
    await act(async () => {
      render(
        <FolderDialog
          open
          onOpenChange={vi.fn()}
          mode="rename"
          parentFolder={null}
          targetFolder={targetFolder}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    expect(screen.getByText('Rename Folder')).toBeInTheDocument();
    expect(screen.getByText('Rename "Archive"')).toBeInTheDocument();
  });

  it('删除文件夹弹窗在英文环境应显示英文文案', async () => {
    await act(async () => {
      render(
        <DeleteFolderDialog
          open
          onOpenChange={vi.fn()}
          folder={targetFolder}
          tableCount={2}
          onConfirm={vi.fn().mockResolvedValue(undefined)}
        />,
      );
    });

    expect(screen.getByText('Delete Folder')).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete "Archive"?'),
    ).toBeInTheDocument();
    expect(screen.getByText(/contains 2 table\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 subfolder\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/Ungrouped/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
