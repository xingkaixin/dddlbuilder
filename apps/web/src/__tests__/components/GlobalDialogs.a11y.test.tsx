import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { GlobalDialogs } from '@/components/App/containers/GlobalDialogs';

vi.mock('@/components/App/AIGenerateDialog', () => ({
  AIGenerateDialog: () => null,
}));

vi.mock('@/components/App/DiffDialog', () => ({
  DiffDialog: () => null,
}));

vi.mock('@/components/App/FolderDialogs', () => ({
  FolderDialog: () => null,
  DeleteFolderDialog: () => null,
}));

vi.mock('@/components/App/ReviewHistoryDialog', () => ({
  ReviewHistoryDialog: () => null,
}));

vi.mock('@/components/App/StorageEstimatorDialog', () => ({
  StorageEstimatorDialog: () => null,
}));

vi.mock('@/components/App/TemplateManagerDialog', () => ({
  TemplateManagerDialog: () => null,
}));

vi.mock('@/components/App/CreateTemplateDialog', () => ({
  CreateTemplateDialog: () => null,
}));

vi.mock('@/components/App/VersionHistoryDialog', () => ({
  VersionHistoryDialog: () => null,
}));

vi.mock('@/components/App/MockDataDialog', () => ({
  MockDataDialog: () => null,
}));

function createProps(): Parameters<typeof GlobalDialogs>[0] {
  return {
    clearDialog: {
      open: false,
      onOpenChange: vi.fn(),
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    },
    saveDialog: {
      open: false,
      onOpenChange: vi.fn(),
      title: '保存当前表',
      description: '请输入保存名称',
      name: '',
      onNameChange: vi.fn(),
      error: '',
      inputDisabled: false,
      canSaveCurrent: true,
      onConfirm: vi.fn(),
    },
    renameDialog: {
      open: false,
      onOpenChange: vi.fn(),
      name: '',
      onNameChange: vi.fn(),
      error: '',
      onConfirm: vi.fn(),
    },
    deleteDialog: {
      open: false,
      onOpenChange: vi.fn(),
      targetName: undefined,
      onConfirm: vi.fn(),
    },
    folderDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      mode: 'create',
      onConfirm: vi.fn(),
    } as any,
    deleteFolderDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      tableCount: 0,
      onConfirm: vi.fn(),
    } as any,
    templateManagerDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      templates: [],
      onCreateTemplate: vi.fn(),
      onUpdateTemplate: vi.fn(),
      onDeleteTemplate: vi.fn(),
    } as any,
    createTemplateDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      onCreate: vi.fn(),
    } as any,
    diffDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
    } as any,
    versionHistoryDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      versions: [],
      onRestore: vi.fn(),
      onDelete: vi.fn(),
    } as any,
    reviewHistoryDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      records: [],
      onDelete: vi.fn(),
      onRestore: vi.fn(),
    } as any,
    aiGenerateDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      dbType: 'mysql',
      onApply: vi.fn(),
    } as any,
    storageEstimatorDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      totalBytes: 0,
      rows: [],
      dbType: 'mysql',
    } as any,
    mockDataDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      tableName: '',
      schemaName: '',
      dbType: 'mysql',
      fields: [],
    } as any,
  };
}

describe('GlobalDialogs a11y', () => {
  it('保存错误应以 alert 语义呈现并接收焦点', async () => {
    const props = createProps();
    props.saveDialog = {
      ...props.saveDialog,
      open: true,
      error: '名称已存在',
    };

    render(<GlobalDialogs {...props} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('名称已存在');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(screen.getByLabelText('保存名称')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('save-table-name-error'),
    );
  });

  it('重命名错误应以 alert 语义呈现并关联输入框', async () => {
    const props = createProps();
    props.renameDialog = {
      ...props.renameDialog,
      open: true,
      error: '名称不能为空',
    };

    render(<GlobalDialogs {...props} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('名称不能为空');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(screen.getByLabelText('新名称')).toHaveAttribute(
      'aria-describedby',
      expect.stringContaining('rename-table-name-error'),
    );
  });

  it('删除确认按钮应关联不可逆风险提示', () => {
    const props = createProps();
    props.deleteDialog = {
      ...props.deleteDialog,
      open: true,
      targetName: '用户表',
    };

    render(<GlobalDialogs {...props} />);

    expect(
      screen.getByRole('button', {
        name: '确认删除',
      }),
    ).toHaveAttribute('aria-describedby', 'delete-warning');
    expect(screen.getByText('此操作无法撤销。')).toBeInTheDocument();
  });
});
