import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportError } from '@/utils/errorReporter';

describe('errorReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should report through console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    reportError('string-error', {
      scope: 'test',
      action: 'console-fallback',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toContain('[test] console-fallback');
  });
});
