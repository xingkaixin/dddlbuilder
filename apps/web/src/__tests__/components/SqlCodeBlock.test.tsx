import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SqlCodeBlock from '@/components/App/SqlCodeBlock';

const theme = vi.hoisted(() => ({ resolvedTheme: 'light' }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Code block snapshots use a fixed theme value.
vi.mock('next-themes', () => ({ useTheme: () => theme }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- The test isolates code block rendering from explain-popover behavior.
vi.mock('@/components/App/ExplainPopover', () => ({
  ExplainPopover: ({ children }: { children: ReactNode }) => children,
}));

describe('SqlCodeBlock', () => {
  it('preserves SQL text and blank lines without including line numbers or interpreting HTML', () => {
    const code = '-- 注释\n\nSELECT \'<img src=x onerror=alert(1)>\', "名前" FROM `users`;\n';
    const { container } = render(<SqlCodeBlock code={code} />);

    expect(container.querySelector('code')?.textContent).toBe(code);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelectorAll('[data-line]')).toHaveLength(4);
    expect(container.querySelector('code span[style*="color"]')).not.toBeNull();
  });

  it('updates highlighting when the theme and SQL change', () => {
    theme.resolvedTheme = 'light';
    const { container, rerender } = render(<SqlCodeBlock code="SELECT 1;" />);
    const lightColor = container.querySelector('code span[style*="color"]')?.getAttribute('style');

    theme.resolvedTheme = 'dark';
    rerender(<SqlCodeBlock code="SELECT 2;" />);

    expect(container.querySelector('code')?.textContent).toBe('SELECT 2;');
    expect(container.querySelector('code span[style*="color"]')?.getAttribute('style')).not.toBe(
      lightColor,
    );
  });
});
