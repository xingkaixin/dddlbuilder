import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/__tests__/utils/test-utils';
import { DataTableToolbar } from '@/components/App/table/DataTableToolbar';

vi.mock('@/components/ui/animated-number', () => ({
  AnimatedNumber: ({ value }: { value: number }) => (
    <span data-testid="animated-number">{String(value)}</span>
  ),
}));

describe('DataTableToolbar', () => {
  it('应通过 AnimatedNumber 渲染冻结列数与添加行数量', () => {
    const { rerender } = render(
      <DataTableToolbar
        freezeEnabled
        onFreezeEnabledChange={vi.fn()}
        effectiveFreezeColumns={3}
        onFreezeColumnsChange={vi.fn()}
        safeAddCount={10}
        onAddCountChange={vi.fn()}
        onAddRowsClick={vi.fn()}
      />,
    );

    expect(
      screen.getAllByTestId('animated-number').map((item) => item.textContent),
    ).toEqual(['3', '10']);

    rerender(
      <DataTableToolbar
        freezeEnabled
        onFreezeEnabledChange={vi.fn()}
        effectiveFreezeColumns={4}
        onFreezeColumnsChange={vi.fn()}
        safeAddCount={12}
        onAddCountChange={vi.fn()}
        onAddRowsClick={vi.fn()}
      />,
    );

    expect(
      screen.getAllByTestId('animated-number').map((item) => item.textContent),
    ).toEqual(['4', '12']);
  });
});
