import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@/__tests__/utils/test-utils';
import { StorageEstimatorDialog } from '@/components/App/StorageEstimatorDialog';
import type { NormalizedField } from '@ddlbuilder/shared-types';

vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value }: { value: number }) => (
    <span data-testid="animated-number">{String(value)}</span>
  ),
}));

describe('StorageEstimatorDialog', () => {
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

    const totalCard = screen.getByText('总计预估大小').closest('div')?.parentElement;
    const rowHeader = screen.getByText('预估承载数据量 (行)').closest('div');

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
});
