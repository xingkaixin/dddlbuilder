import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSuggestionAnimation } from '@/hooks/useSuggestionAnimation';

describe('useSuggestionAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('应提供初始动画状态', () => {
    const { result } = renderHook(() => useSuggestionAnimation());

    expect(result.current.animatingIndexIds.size).toBe(0);
    expect(result.current.removingIndexIds.size).toBe(0);
    expect(result.current.isFieldTableHighlighted).toBe(false);
    expect(result.current.highlightedRowIndex).toBe(null);
  });

  it('应处理索引 add/remove 动画并在到时后清理', () => {
    const { result } = renderHook(() => useSuggestionAnimation());

    act(() => {
      result.current.triggerIndexAnimation('idx_1', 'add');
    });
    expect(result.current.animatingIndexIds.has('idx_1')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current.animatingIndexIds.has('idx_1')).toBe(false);

    act(() => {
      result.current.triggerIndexAnimation('idx_2', 'remove');
    });
    expect(result.current.removingIndexIds.has('idx_2')).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.removingIndexIds.has('idx_2')).toBe(false);
  });

  it('应支持字段表高亮并在重复触发时重置计时', () => {
    const { result } = renderHook(() => useSuggestionAnimation());

    act(() => {
      result.current.triggerFieldTableHighlight(3);
    });
    expect(result.current.isFieldTableHighlighted).toBe(true);
    expect(result.current.highlightedRowIndex).toBe(3);

    act(() => {
      vi.advanceTimersByTime(600);
      result.current.triggerFieldTableHighlight();
    });
    expect(result.current.isFieldTableHighlighted).toBe(true);
    expect(result.current.highlightedRowIndex).toBe(null);

    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(result.current.isFieldTableHighlighted).toBe(false);
    expect(result.current.highlightedRowIndex).toBe(null);
  });
});
