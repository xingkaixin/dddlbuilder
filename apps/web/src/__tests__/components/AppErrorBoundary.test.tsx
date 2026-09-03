import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@/__tests__/utils/test-utils';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { reportError } from '@/utils/errorReporter';
import type { ReactElement } from 'react';

vi.mock('@/utils/errorReporter', () => ({
  reportError: vi.fn(),
}));

function CrashComponent(): ReactElement {
  throw new Error('render-crash');
}

describe('AppErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render fallback UI and report error when child crashes', () => {
    render(
      <AppErrorBoundary>
        <CrashComponent />
      </AppErrorBoundary>,
    );

    expect(screen.getByText('页面发生错误')).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        scope: 'AppErrorBoundary',
        action: 'renderCrash',
      }),
    );
  });
});
