import { render } from '@/__tests__/utils/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { ImportSqlDialog } from '@/components/ImportSqlDialog';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// oxlint-disable-next-line anti-slop/no-module-mocking -- Isolates the parser transport so this test can focus on file and text size gates.
vi.mock('@/services/sqlParseService', () => ({
  requestSqlParse: vi.fn(),
  requestMultiSqlParse: vi.fn(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Supplies the notification context without coupling input-limit assertions to the toast implementation.
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Provides a small interactive child so the dialog test can drive file/source inputs without rendering the full input step.
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
});
