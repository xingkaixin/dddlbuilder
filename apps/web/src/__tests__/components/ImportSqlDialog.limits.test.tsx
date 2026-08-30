import { act, fireEvent, render, screen, waitFor } from '@/__tests__/utils/test-utils';
import { ImportSqlDialog } from '@/components/ImportSqlDialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/sqlParseService', () => ({
  requestSqlParse: vi.fn(),
  requestMultiSqlParse: vi.fn(),
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ImportSqlDialog/SqlInputStep', () => ({
  SqlInputStep: ({
    onFileChange,
    onSourceTypeChange,
    onSqlChange,
    sql,
    validationResult,
  }: {
    onFileChange: (file: File | null) => void;
    onSourceTypeChange: (source: 'csv' | 'excel') => void;
    onSqlChange: (value: string) => void;
    sql: string;
    validationResult: { error?: string } | null;
  }) => (
    <>
      <button type="button" onClick={() => onSourceTypeChange('csv')}>
        选择 CSV
      </button>
      <button type="button" onClick={() => onSourceTypeChange('excel')}>
        选择 Excel
      </button>
      <label>
        上传文件
        <input type="file" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
      </label>
      <label>
        导入内容
        <textarea value={sql} onChange={(event) => onSqlChange(event.target.value)} />
      </label>
      {validationResult?.error ? <p>{validationResult.error}</p> : null}
    </>
  ),
}));

describe('ImportSqlDialog limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('读取文件前按字节数拒绝过大输入', async () => {
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选择 CSV' }));
    const file = new File(['x'.repeat(1_048_577)], 'oversized.csv', { type: 'text/csv' });
    const readText = vi.fn().mockResolvedValue('name,type\nid,int');
    Object.defineProperty(file, 'text', { value: readText });

    fireEvent.change(screen.getByLabelText('上传文件'), { target: { files: [file] } });

    expect(await screen.findByText('文件过大，最大允许 1 MB')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一步' }));
    expect(readText).not.toHaveBeenCalled();
  });

  it('Excel 使用独立的文件字节限制', async () => {
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选择 Excel' }));
    const file = new File(['x'.repeat(10 * 1_048_576 + 1)], 'oversized.xlsx');

    fireEvent.change(screen.getByLabelText('上传文件'), { target: { files: [file] } });

    expect(await screen.findByText('文件过大，最大允许 10 MB')).toBeInTheDocument();
  });

  it('读取文本文件后执行与粘贴输入相同的字符限制', async () => {
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选择 CSV' }));
    const file = new File(['small'], 'fields.csv', { type: 'text/csv' });
    const readText = vi
      .fn()
      .mockResolvedValue(`fieldName,fieldType\nid,bigint${' '.repeat(200_000)}`);
    Object.defineProperty(file, 'text', { value: readText });
    fireEvent.change(screen.getByLabelText('上传文件'), { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('导入内容过长，最大允许 200,000 个字符')).toBeInTheDocument();
    expect(readText).toHaveBeenCalledOnce();
  });

  it('粘贴结构化文本使用同一个字符限制', async () => {
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '选择 CSV' }));
    fireEvent.change(screen.getByLabelText('导入内容'), {
      target: { value: `fieldName,fieldType\nid,bigint${' '.repeat(200_000)}` },
    });

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('导入内容过长，最大允许 200,000 个字符')).toBeInTheDocument();
  });

  it('按清理空白前的 SQL 原文执行字符限制', async () => {
    render(
      <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
    );
    fireEvent.change(screen.getByLabelText('导入内容'), {
      target: { value: `CREATE TABLE users (id INT);${' '.repeat(50_000)}` },
    });

    fireEvent.click(screen.getByRole('button', { name: '下一步' }));

    expect(await screen.findByText('SQL 内容过长，最大允许 50,000 个字符')).toBeInTheDocument();
  });

  it.each(['text', 'file'] as const)(
    '忽略已被后续 %s 输入替换的文件读取结果',
    async (nextInput) => {
      render(
        <ImportSqlDialog currentDbType="mysql" onImport={vi.fn()} open onOpenChange={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole('button', { name: '选择 CSV' }));

      let resolveOldFile: (value: string) => void = () => undefined;
      const oldFileText = new Promise<string>((resolve) => {
        resolveOldFile = resolve;
      });
      const oldFile = new File(['old'], 'old.csv', { type: 'text/csv' });
      const readOldFile = vi.fn().mockReturnValue(oldFileText);
      Object.defineProperty(oldFile, 'text', { value: readOldFile });
      fireEvent.change(screen.getByLabelText('上传文件'), { target: { files: [oldFile] } });
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      await waitFor(() => expect(readOldFile).toHaveBeenCalledOnce());

      if (nextInput === 'text') {
        fireEvent.change(screen.getByLabelText('导入内容'), {
          target: { value: 'fieldName,fieldType\nnew_id,bigint' },
        });
      } else {
        const newFile = new File(['new'], 'new.csv', { type: 'text/csv' });
        Object.defineProperty(newFile, 'text', {
          value: vi.fn().mockResolvedValue('fieldName,fieldType\nnew_id,bigint'),
        });
        fireEvent.change(screen.getByLabelText('上传文件'), { target: { files: [newFile] } });
      }

      await act(async () => {
        resolveOldFile('fieldName,fieldType\nold_id,bigint');
        await oldFileText;
      });

      expect(screen.queryByDisplayValue('old_id')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '下一步' }));
      expect(await screen.findByDisplayValue('new_id')).toBeInTheDocument();
    },
  );
});
