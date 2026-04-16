import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reportError, setErrorReporter } from '@/utils/errorReporter';

describe('errorReporter', () => {
  beforeEach(() => {
    setErrorReporter(null);
  });

  afterEach(() => {
    setErrorReporter(null);
    vi.restoreAllMocks();
  });

  it('should call external reporter when configured', () => {
    const reporter = vi.fn();
    setErrorReporter(reporter);

    reportError(new Error('boom'), {
      scope: 'test',
      action: 'external-report',
    });

    expect(reporter).toHaveBeenCalledTimes(1);
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'boom',
        name: 'Error',
        context: {
          scope: 'test',
          action: 'external-report',
        },
      }),
    );
  });

  it('should fallback to console.error when external reporter is absent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportError('string-error', {
      scope: 'test',
      action: 'console-fallback',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('[test] console-fallback');
  });
});
