import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/__tests__/utils/test-utils';
import { DeleteFolderDialog } from '@/components/App/FolderDialogs';
import type { FolderTreeNode } from '@/hooks/useFolders';
import { i18n } from '@/i18n';

const folder: FolderTreeNode = {
  id: 'folder-1',
  name: 'Orders',
  order: 0,
  createdAt: 1,
  updatedAt: 1,
  children: [],
};

describe('DeleteFolderDialog', () => {
  it('keeps the dialog open when deletion fails', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(false);

    render(
      <DeleteFolderDialog
        open
        onOpenChange={onOpenChange}
        folder={folder}
        tableCount={1}
        onConfirm={onConfirm}
      />,
    );

    const confirmButton = screen.getByRole('button', {
      name: i18n.t('savedTables.deleteFolderDialog.confirm'),
    });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('closes the dialog when deletion succeeds', async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue(true);

    render(
      <DeleteFolderDialog
        open
        onOpenChange={onOpenChange}
        folder={folder}
        tableCount={0}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: i18n.t('savedTables.deleteFolderDialog.confirm'),
      }),
    );

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
