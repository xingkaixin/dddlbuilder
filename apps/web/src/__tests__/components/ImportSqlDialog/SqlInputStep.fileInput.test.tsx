import { render, screen, userEvent } from '@/__tests__/utils/test-utils';
import { SqlInputStep } from '@/components/ImportSqlDialog/SqlInputStep';
import { describe, expect, it, vi } from 'vitest';

const baseProps = {
  selectedDbType: 'mysql' as const,
  onDbTypeChange: vi.fn(),
  sourceType: 'csv' as const,
  onSourceTypeChange: vi.fn(),
  sql: '',
  onSqlChange: vi.fn(),
  file: null,
  onFileChange: vi.fn(),
  validationResult: null,
};

describe('SqlInputStep file input', () => {
  it('clears a rejected file from the browser input', async () => {
    const { rerender } = render(<SqlInputStep {...baseProps} />);
    const input = screen.getByLabelText('上传文件') as HTMLInputElement;

    await userEvent.upload(input, new File(['oversized'], 'oversized.csv', { type: 'text/csv' }));
    expect(input.files).toHaveLength(1);

    rerender(
      <SqlInputStep {...baseProps} validationResult={{ success: false, error: 'too large' }} />,
    );

    expect(input.files).toHaveLength(0);
    expect(input.value).toBe('');
  });

  it('clears the browser input when the source type changes', async () => {
    const { rerender } = render(<SqlInputStep {...baseProps} />);
    const input = screen.getByLabelText('上传文件') as HTMLInputElement;

    await userEvent.upload(input, new File(['fields'], 'fields.csv', { type: 'text/csv' }));
    expect(input.files).toHaveLength(1);

    rerender(<SqlInputStep {...baseProps} sourceType="json" />);

    expect(screen.getByLabelText('上传文件')).toHaveProperty('files.length', 0);
  });
});
