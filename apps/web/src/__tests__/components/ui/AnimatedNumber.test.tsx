import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@/__tests__/utils/test-utils';
import { AnimatedNumber } from '@/components/ui/animated-number';
import type { NumberFlowProps } from '@number-flow/react';

const mockNumberFlowRender = vi.fn();
const mockUsePrefersReducedMotion = vi.fn();

// oxlint-disable-next-line anti-slop/no-module-mocking -- Adapts the animation SDK to jsdom while preserving the value and reduced-motion contract under test.
vi.mock('@number-flow/react', () => ({
  __esModule: true,
  default: (props: NumberFlowProps) => {
    mockNumberFlowRender(props);

    return <span data-testid="number-flow">{String(props.value)}</span>;
  },
  usePrefersReducedMotion: () => mockUsePrefersReducedMotion(),
}));

describe('AnimatedNumber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePrefersReducedMotion.mockReturnValue(false);
  });

  it('默认应使用 NumberFlow 渲染', () => {
    render(
      <AnimatedNumber value={1234} format={{ useGrouping: true, maximumFractionDigits: 0 }} />,
    );

    expect(screen.getByTestId('number-flow')).toHaveTextContent('1234');
    expect(mockNumberFlowRender).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 1234,
        format: { useGrouping: true, maximumFractionDigits: 0 },
      }),
    );
  });

  it('reduced-motion 下应降级为静态数字', () => {
    mockUsePrefersReducedMotion.mockReturnValue(true);

    render(
      <AnimatedNumber value={1234} format={{ useGrouping: true, maximumFractionDigits: 0 }} />,
    );

    expect(screen.queryByTestId('number-flow')).not.toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });
});
