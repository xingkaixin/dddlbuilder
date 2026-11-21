import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import { removeLocalStorageItem, writeLocalStorageJson } from '@/utils/localStorage';

describe('localStorage helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMemoryLocalStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes JSON values and logs a warning instead of throwing on storage errors', () => {
    writeLocalStorageJson('test:key', { x: 1, y: 2 }, '[test] write');
    expect(window.localStorage.getItem('test:key')).toBe('{"x":1,"y":2}');

    const quotaError = new DOMException('Quota exceeded', 'QuotaExceededError');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(window.localStorage.setItem).mockImplementationOnce(() => {
      throw quotaError;
    });

    expect(() => writeLocalStorageJson('test:key', { x: 3 }, '[test] write')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[test] write failed', quotaError);
  });

  it('removes keys and logs a warning instead of throwing on storage errors', () => {
    window.localStorage.setItem('test:key', 'value');
    removeLocalStorageItem('test:key', '[test] remove');
    expect(window.localStorage.getItem('test:key')).toBeNull();

    const securityError = new DOMException('Access denied', 'SecurityError');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(window.localStorage.removeItem).mockImplementationOnce(() => {
      throw securityError;
    });

    expect(() => removeLocalStorageItem('test:key', '[test] remove')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith('[test] remove failed', securityError);
  });
});
