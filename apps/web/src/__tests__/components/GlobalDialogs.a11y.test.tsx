import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { GlobalDialogs } from '@/components/App/containers/GlobalDialogs';

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/AIGenerateDialog', () => ({
  AIGenerateDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/DiffDialog', () => ({
  DiffDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/FolderDialogs', () => ({
  FolderDialog: () => null,
  DeleteFolderDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/ReviewHistoryDialog', () => ({
  ReviewHistoryDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/StorageEstimatorDialog', () => ({
  StorageEstimatorDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/TemplateManagerDialog', () => ({
  TemplateManagerDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/TableTemplateManagerDialog', () => ({
  TableTemplateManagerDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/CreateTemplateDialog', () => ({
  CreateTemplateDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/CreateTableTemplateDialog', () => ({
  CreateTableTemplateDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/VersionHistoryDialog', () => ({
  VersionHistoryDialog: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
vi.mock('@/components/App/SchemaTimelinePlayer', () => ({
  SchemaTimelinePlayer: () => null,
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 子对话框替换用于隔离 GlobalDialogs 的焦点和可访问性宿主行为。
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
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    folderDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      mode: 'create',
      onConfirm: vi.fn(),
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    deleteFolderDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      tableCount: 0,
      onConfirm: vi.fn(),
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    templateManagerDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      templates: [],
      onCreateTemplate: vi.fn(),
      onUpdateTemplate: vi.fn(),
      onDeleteTemplate: vi.fn(),
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    createTemplateDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      onCreate: vi.fn(),
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    tableTemplateManagerDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      templates: [],
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    createTableTemplateDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      onConfirm: vi.fn(),
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    diffDialogProps: {} as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    versionHistoryDialogProps: {
      versions: [],
      onRestore: vi.fn(),
      onDelete: vi.fn(),
    } as any,
    timelinePlayerProps: null,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    reviewHistoryDialogProps: {
      records: [],
      onDelete: vi.fn(),
      onRestore: vi.fn(),
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    aiGenerateDialogProps: {
      dbType: 'mysql',
      onApply: vi.fn(),
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    storageEstimatorDialogProps: {
      totalBytes: 0,
      rows: [],
      dbType: 'mysql',
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    mockDataDialogProps: {
      tableName: '',
      schemaName: '',
      dbType: 'mysql',
      fields: [],
    } as any,
    // SAFETY: This fixture supplies only the child-dialog props needed by the GlobalDialogs a11y case.
    erDiagramDialogProps: {
      open: false,
      onOpenChange: vi.fn(),
      onSelectTable: vi.fn(),
    } as any,
    emptyTrashDialog: {
      open: false,
      onOpenChange: vi.fn(),
      onConfirm: vi.fn(),
    },
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
        name: '移入回收站',
      }),
    ).toHaveAttribute('aria-describedby', 'delete-warning');
    expect(screen.getByText('表会先进入回收站。')).toBeInTheDocument();
  });
});
