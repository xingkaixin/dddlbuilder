import { AmbiguousTableOverwriteError } from '@/utils/savedTableBatchImport';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@/__tests__/utils/test-utils';
import { ImportSqlDialog } from '@/components/ImportSqlDialog';
import { requestMultiSqlParse, requestSqlParse } from '@/services/sqlParseService';
import { ApiError } from '@/services/apiError';

vi.mock('@/services/sqlParseService', () => ({
  requestSqlParse: vi.fn(),
  requestMultiSqlParse: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: any }) => <>{children}</>,
  Tooltip: ({ children }: { children: any }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: any }) => <>{children}</>,
  TooltipContent: ({ children }: { children: any }) => <>{children}</>,
}));

const mockedRequestSqlParse = vi.mocked(requestSqlParse);
const mockedRequestMultiSqlParse = vi.mocked(requestMultiSqlParse);

describe('ImportSqlDialog', () => {
  it.each([false, true])(
    'preserves a failed batch import for retry, ambiguous=%s',
    async (ambiguous) => {
      mockedRequestMultiSqlParse.mockResolvedValue({
        results: [
          {
            tableName: 'users',
            tableComment: '',
            fields: [],
            indexes: [],
            foreignKeys: [],
            authObjects: [],
          },
        ],
        failed: [],
      });
      const onBatchImport = vi
        .fn()
        .mockRejectedValueOnce(
          ambiguous ? new AmbiguousTableOverwriteError() : new Error('storage unavailable'),
        )
        .mockResolvedValue({ successCount: 1, skipCount: 0, failCount: 0 });
      const onOpenChange = vi.fn();
      render(
        <ImportSqlDialog
          currentDbType="mysql"
          onImport={vi.fn()}
          open
          onOpenChange={onOpenChange}
          savedTables={[]}
          folderTree={[]}
          onBatchImport={onBatchImport}
        />,
      );
      fireEvent.click(await screen.findByLabelText('保存为已保存表'));
      fireEvent.change(screen.getByLabelText('SQL 内容'), {
        target: { value: 'CREATE TABLE users (id INT);' },
      });
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      await screen.findByText('users');
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
      await waitFor(() => expect(onBatchImport).toHaveBeenCalledOnce());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        ambiguous ? '存在多张同名表' : '导入失败',
      );
      expect(onOpenChange).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
      await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
      expect(onBatchImport.mock.calls[1][0]).toMatchObject({
        conflictStrategy: 'skip',
        items: [{ name: 'users', state: { tableName: 'users' } }],
      });
    },
  );

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

  it.each([
    ['workspace', new Error('parser-stack-detail-should-not-be-exposed')],
    ['saved', new Error('parser-stack-detail-should-not-be-exposed')],
    ['workspace', new ApiError('parser-stack-detail-should-not-be-exposed', 400, 'INTERNAL_ERROR')],
    ['saved', new ApiError('parser-stack-detail-should-not-be-exposed', 500, 'SQL_PARSE_FAILED')],
  ] as const)('%s 模式应使用统一友好文案屏蔽未知解析错误 %s', async (mode, error) => {
    mockedRequestSqlParse.mockRejectedValue(error);
    mockedRequestMultiSqlParse.mockRejectedValue(error);
    render(
      <ImportSqlDialog
        currentDbType="mysql"
        onImport={vi.fn()}
        open
        onOpenChange={vi.fn()}
        savedTables={[]}
        folderTree={[]}
        onBatchImport={vi.fn()}
      />,
    );
    if (mode === 'saved') fireEvent.click(await screen.findByLabelText('保存为已保存表'));
    fireEvent.change(screen.getByLabelText('SQL 内容'), {
      target: { value: 'CREATE TABLE demo (id INT);' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('SQL 解析失败，请检查 SQL 语法后重试。')).toBeInTheDocument();
    expect(screen.queryByText('parser-stack-detail-should-not-be-exposed')).toBeNull();
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

  it('应在正常输入时继续走解析流程并进入预览', async () => {
    mockedRequestSqlParse.mockResolvedValue({
      tableName: 'users',
      tableComment: '',
      fields: [
        {
          name: 'id',
          type: 'int',
          comment: '主键',
          nullable: false,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
      indexes: [],
      foreignKeys: [],
      authObjects: [],
    });
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
    );
    const textarea = await screen.findByLabelText('SQL 内容');
    fireEvent.change(textarea, {
      target: { value: '  CREATE TABLE users (id INT);  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    await waitFor(() => {
      expect(mockedRequestSqlParse).toHaveBeenCalledWith({
        sql: 'CREATE TABLE users (id INT);',
        dbType: 'mysql',
      });
    });
    expect(await screen.findByText(/表名:/)).toBeInTheDocument();
    expect(screen.getByText('users')).toBeInTheDocument();
  });

  it('解析到授权信息时应在预览和确认步骤展示并导入', async () => {
    const parsedResult = {
      tableName: 'COO_SC_RAT',
      tableComment: '',
      fields: [
        {
          name: 'id',
          type: 'int',
          comment: '主键',
          nullable: false,
          defaultKind: 'none' as const,
          defaultValue: '',
          onUpdate: 'none' as const,
        },
      ],
      indexes: [],
      foreignKeys: [],
      authObjects: ['cb1', 'cb2'],
    };
    mockedRequestSqlParse.mockResolvedValue(parsedResult);
    const onImport = vi.fn();

    render(
      <ImportSqlDialog currentDbType="mysql" onImport={onImport} open onOpenChange={vi.fn()} />,
    );
    const textarea = await screen.findByLabelText('SQL 内容');
    fireEvent.change(textarea, {
      target: {
        value: 'CREATE TABLE COO_SC_RAT (id INT); GRANT SELECT ON COO_SC_RAT TO cb1;',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText(/授权对象数:/)).toBeInTheDocument();
    expect(screen.getByText('cb1')).toBeInTheDocument();
    expect(screen.getByText('cb2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(await screen.findByText('授权对象: cb1, cb2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));

    expect(onImport).toHaveBeenCalledWith(parsedResult, 'mysql');
  });

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
