import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@/__tests__/utils/test-utils';
import { ImportSqlDialog } from '@/components/ImportSqlDialog';
import { requestSqlParse } from '@/services/sqlParseService';

vi.mock('@/services/sqlParseService', () => ({
  requestSqlParse: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

const mockedRequestSqlParse = vi.mocked(requestSqlParse);

describe('ImportSqlDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('应在前端拦截超长 SQL 并提示错误', async () => {
    render(<ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} triggerLabel="导入 SQL" />);

    fireEvent.click(screen.getByRole('button', { name: '导入 SQL' }));
    const textarea = await screen.findByLabelText('SQL 内容');
    fireEvent.change(textarea, {
      target: { value: `CREATE TABLE t (${`a`.repeat(50_010)})` },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('SQL 内容过长，最大允许 50,000 个字符')).toBeInTheDocument();
    expect(mockedRequestSqlParse).not.toHaveBeenCalled();
  });

  it('应使用统一友好文案展示解析失败信息', async () => {
    mockedRequestSqlParse.mockRejectedValue(new Error('parser-stack-detail-should-not-be-exposed'));
    render(<ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} triggerLabel="导入 SQL" />);

    fireEvent.click(screen.getByRole('button', { name: '导入 SQL' }));
    const textarea = await screen.findByLabelText('SQL 内容');
    fireEvent.change(textarea, {
      target: { value: 'CREATE TABLE demo (id INT);' },
    });
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    const errorText = await screen.findByText('SQL 解析失败，请检查 SQL 语法后重试。');
    expect(errorText).toBeInTheDocument();
    expect(screen.queryByText('parser-stack-detail-should-not-be-exposed')).toBeNull();
  });

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
      authObjects: [],
    });
    render(<ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} triggerLabel="导入 SQL" />);

    fireEvent.click(screen.getByRole('button', { name: '导入 SQL' }));
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
      authObjects: ['cb1', 'cb2'],
    };
    mockedRequestSqlParse.mockResolvedValue(parsedResult);
    const onImport = vi.fn();

    render(<ImportSqlDialog currentDbType="mysql" onImport={onImport} triggerLabel="导入 SQL" />);

    fireEvent.click(screen.getByRole('button', { name: '导入 SQL' }));
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
});
