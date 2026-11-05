import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from '@/__tests__/utils/test-utils';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { ImportSqlDialog } from '@/components/ImportSqlDialog';
import { requestMultiSqlParse, requestSqlParse } from '@/services/sqlParseService';
import { ApiError } from '@/services/apiError';

// oxlint-disable-next-line anti-slop/no-module-mocking -- 依赖替换用于隔离导入对话框的解析、生成和提示边界。
vi.mock('@/services/sqlParseService', () => ({
  requestSqlParse: vi.fn(),
  requestMultiSqlParse: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 依赖替换用于隔离导入对话框的解析、生成和提示边界。
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- 依赖替换用于隔离导入对话框的解析、生成和提示边界。
vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: any }) => <>{children}</>,
  Tooltip: ({ children }: { children: any }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: any }) => <>{children}</>,
  TooltipContent: ({ children }: { children: any }) => <>{children}</>,
}));

const mockedRequestSqlParse = vi.mocked(requestSqlParse);
const mockedRequestMultiSqlParse = vi.mocked(requestMultiSqlParse);

describe('ImportSqlDialog', () => {
  it('imports the edited, reordered and filtered preview', async () => {
    const parsed = {
      tableName: 'users',
      tableComment: '',
      fields: ['id', 'name', 'removed'].map((name) => ({
        name,
        type: 'int',
        comment: '',
        nullable: true,
        defaultKind: 'none' as const,
        defaultValue: '',
        onUpdate: 'none' as const,
      })),
      indexes: [],
      foreignKeys: [],
      authObjects: [],
    };
    mockedRequestSqlParse.mockResolvedValue(parsed);
    const onImport = vi.fn();
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={onImport} open onOpenChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('SQL 内容'), {
      target: { value: 'CREATE TABLE users (id int);' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.change(await screen.findByLabelText('字段名 #1'), {
      target: { value: 'account_id' },
    });
    fireEvent.change(screen.getByLabelText('字段类型 #1'), { target: { value: 'bigint' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move down #1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete #3' }));
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    expect(
      onImport.mock.calls[0]?.[0].fields.map((field: { name: string; type: string }) => [
        field.name,
        field.type,
      ]),
    ).toEqual([
      ['name', 'int'],
      ['account_id', 'bigint'],
    ]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应在前端拦截超长 SQL 并提示错误', async () => {
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
    );
    const textarea = await screen.findByLabelText('SQL 内容');
    fireEvent.change(textarea, {
      target: { value: `CREATE TABLE t (${`a`.repeat(50_010)})` },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('SQL 内容过长，最大允许 50,000 个字符')).toBeInTheDocument();
    expect(mockedRequestSqlParse).not.toHaveBeenCalled();
  });

  it.each(['workspace', 'saved'] as const)(
    '%s 模式应展示不支持定义的具体原因并阻止导入',
    async (mode) => {
      const message = '暂不支持导入 生成列，无法完整保留该定义。';
      const error = new ApiError(message, 400, 'SQL_PARSE_FAILED');
      mockedRequestSqlParse.mockRejectedValue(error);
      mockedRequestMultiSqlParse.mockRejectedValue(error);
      const onImport = vi.fn();
      const onBatchImport = vi.fn();
      render(
        <ImportSqlDialog
          currentDbType="mysql"
          onImport={onImport}
          open
          onOpenChange={vi.fn()}
          savedTables={[]}
          folderTree={[]}
          onBatchImport={onBatchImport}
        />,
      );

      if (mode === 'saved') fireEvent.click(await screen.findByLabelText('保存为已保存表'));
      fireEvent.change(screen.getByLabelText('SQL 内容'), {
        target: { value: 'CREATE TABLE totals (total INT GENERATED ALWAYS AS (1) STORED);' },
      });
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '确认导入' })).toBeNull();
      expect(onImport).not.toHaveBeenCalled();
      expect(onBatchImport).not.toHaveBeenCalled();
    },
  );

  it('批量导入应规范化冲突名并只调用一次数据层操作', async () => {
    mockedRequestMultiSqlParse.mockResolvedValue({
      results: [
        {
          tableName: ' USERS ',
          tableComment: '',
          fields: [],
          indexes: [],
          foreignKeys: [],
          authObjects: [],
        },
      ],
      failed: [],
    });

    const onBatchImport = vi.fn().mockResolvedValue({
      successCount: 0,
      skipCount: 1,
      failCount: 0,
    });

    render(
      <ImportSqlDialog
        currentDbType="mysql"
        onImport={vi.fn()}
        open
        onOpenChange={vi.fn()}
        savedTables={[
          {
            tableId: 'table-users',
            normalizedName: 'users',
            name: 'users',
            dbType: 'mysql',
            fieldCount: 0,
            createdAt: 1,
            updatedAt: 1,
          },
        ]}
        folderTree={[]}
        onBatchImport={onBatchImport}
      />,
    );
    fireEvent.click(await screen.findByLabelText('保存为已保存表'));
    fireEvent.change(screen.getByLabelText('SQL 内容'), {
      target: { value: 'CREATE TABLE USERS (id INT);' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('同名冲突')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));

    await waitFor(() => {
      expect(onBatchImport).toHaveBeenCalledTimes(1);
    });
    expect(onBatchImport).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          name: ' USERS ',
          state: expect.objectContaining({ tableName: ' USERS ', dbType: 'mysql' }),
        }),
      ],
      conflictStrategy: 'skip',
      folderId: undefined,
    });
  });
});
