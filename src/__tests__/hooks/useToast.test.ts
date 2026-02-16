import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useToast } from '@/hooks';
import { toast } from 'sonner';

// Mock sonner
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

describe('useToast', () => {
  it('应该暴露所有 toast 方法', () => {
    const { result } = renderHook(() => useToast());
    expect(typeof result.current.showToast).toBe('function');
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.info).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.promise).toBe('function');
    expect(typeof result.current.dismiss).toBe('function');
  });

  it('调用 showToast 应该触发 sonner.toast', () => {
    const { result } = renderHook(() => useToast());
    const message = '测试消息';
    result.current.showToast(message);
    expect(toast).toHaveBeenCalledWith(message, undefined);
  });

  it('调用 success 应该触发 sonner.toast.success', () => {
    const { result } = renderHook(() => useToast());
    const message = '成功消息';
    result.current.success(message);
    expect(toast.success).toHaveBeenCalledWith(message, undefined);
  });

  it('调用 error 应该触发 sonner.toast.error', () => {
    const { result } = renderHook(() => useToast());
    const message = '错误消息';
    result.current.error(message);
    expect(toast.error).toHaveBeenCalledWith(message, undefined);
  });

  it('调用 info 应该触发 sonner.toast.info', () => {
    const { result } = renderHook(() => useToast());
    const message = '提示消息';
    result.current.info(message);
    expect(toast.info).toHaveBeenCalledWith(message, undefined);
  });

  it('调用 warning 应该触发 sonner.toast.warning', () => {
    const { result } = renderHook(() => useToast());
    const message = '警告消息';
    result.current.warning(message);
    expect(toast.warning).toHaveBeenCalledWith(message, undefined);
  });

  it('调用 promise 应该触发 sonner.toast.promise', () => {
    const { result } = renderHook(() => useToast());
    const promise = Promise.resolve('data');
    const data = { loading: 'Loading...', success: 'Success', error: 'Error' };

    result.current.promise(promise, data);
    expect(toast.promise).toHaveBeenCalledWith(
      promise,
      expect.objectContaining(data),
    );
  });

  it('调用 dismiss 应该触发 sonner.toast.dismiss', () => {
    const { result } = renderHook(() => useToast());
    const toastId = 'test-id';

    result.current.dismiss(toastId);
    expect(toast.dismiss).toHaveBeenCalledWith(toastId);
  });
});
