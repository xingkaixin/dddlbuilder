import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@/__tests__/utils/test-utils';
import { StorageEstimatorDialog } from '@/components/App/StorageEstimatorDialog';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import i18n from '@/i18n';

vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value }: { value: number }) => (
    <span data-testid="animated-number">{String(value)}</span>
  ),
}));

describe('StorageEstimatorDialog', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('zh-CN'));
  });

  it('拖动滑块后应更新行数和总计的动画数字值', async () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'bigint',
        nullable: false,
        comment: '',
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    render(<StorageEstimatorDialog open onOpenChange={vi.fn()} dbType="mysql" fields={fields} />);

    const totalCard = screen.getByText('磁盘占用合计').closest('div')?.parentElement;
    const rowHeader = screen.getByText('预估承载数据量（行）').closest('div');

    expect(totalCard).toBeTruthy();
    expect(rowHeader).toBeTruthy();

    const totalValueBefore = Number(
      within(totalCard as HTMLElement).getByTestId('animated-number').textContent,
    );
    const rowsValueBefore = Number(
      within(rowHeader as HTMLElement).getByTestId('animated-number').textContent,
    );

    expect(rowsValueBefore).toBe(10000);

    fireEvent.change(screen.getByRole('slider'), {
      target: { value: '20000' },
    });

    await waitFor(() => {
      expect(
        Number(within(rowHeader as HTMLElement).getByTestId('animated-number').textContent),
      ).toBe(20000);
    });

    await waitFor(() => {
      expect(
        Number(within(totalCard as HTMLElement).getByTestId('animated-number').textContent),
      ).toBeGreaterThan(totalValueBefore);
    });
  });

  it('uses the active locale for labels and calculated explanations', async () => {
    await act(() => i18n.changeLanguage('en-US'));

    render(<StorageEstimatorDialog open onOpenChange={vi.fn()} dbType="mysql" fields={[]} />);

    expect(screen.getByText('Storage Capacity Estimator')).toBeInTheDocument();
    expect(screen.getByText('Estimated disk usage')).toBeInTheDocument();
    expect(
      screen.getByText('No indexes are defined, so index storage is estimated as zero.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('存储容量估算器')).not.toBeInTheDocument();
  });
});
