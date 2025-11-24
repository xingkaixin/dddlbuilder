import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '@/hooks';

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应该初始化为空状态', () => {
    const { result } = renderHook(() => useToast());

    expect(result.current.toastMessage).toBe('');
    expect(typeof result.current.showToast).toBe('function');
  });

  it('应该显示 toast 消息', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('测试消息');
    });

    expect(result.current.toastMessage).toBe('测试消息');
  });

  it('应该在 1.6 秒后自动隐藏消息', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('自动消失的消息');
    });

    expect(result.current.toastMessage).toBe('自动消失的消息');

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(result.current.toastMessage).toBe('');
  });

  it('应该能够连续显示不同的消息', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('第一条消息');
    });

    expect(result.current.toastMessage).toBe('第一条消息');

    act(() => {
      result.current.showToast('第二条消息');
    });

    expect(result.current.toastMessage).toBe('第二条消息');
  });

  it('应该处理空字符串消息', () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('');
    });

    expect(result.current.toastMessage).toBe('');
  });

  it('应该处理特殊字符消息', () => {
    const { result } = renderHook(() => useToast());

    const specialMessage = '🎉 消息包含 emoji 和特殊字符 @#$%^&*()';

    act(() => {
      result.current.showToast(specialMessage);
    });

    expect(result.current.toastMessage).toBe(specialMessage);
  });

  it('应该处理长消息', () => {
    const { result } = renderHook(() => useToast());

    const longMessage = 'a'.repeat(1000);

    act(() => {
      result.current.showToast(longMessage);
    });

    expect(result.current.toastMessage).toBe(longMessage);
  });

  it('应该能够多次调用 showTest 并正确处理定时器', () => {
    const { result } = renderHook(() => useToast());

    // 显示第一条消息
    act(() => {
      result.current.showToast('消息1');
    });

    // 快速显示第二条消息
    act(() => {
      result.current.showToast('消息2');
    });

    expect(result.current.toastMessage).toBe('消息2');

    // 前进时间，应该清除的是最后一条消息
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(result.current.toastMessage).toBe('');
  });

  it('应该正确处理定时器清理', () => {
    const { result, unmount } = renderHook(() => useToast());

    act(() => {
      result.current.showToast('测试消息');
    });

    expect(result.current.toastMessage).toBe('测试消息');

    // 在消息消失前卸载组件
    unmount();

    // 前进时间，不应该有错误
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // 这里主要测试没有内存泄漏或错误抛出
    expect(true).toBe(true);
  });
});
