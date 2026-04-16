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
    expect(result.current.animatingFieldNames.size).toBe(0);
    expect(result.current.removingFieldNames.size).toBe(0);
    expect(result.current.modifyingFieldNames.size).toBe(0);
    expect(result.current.isFieldTableHighlighted).toBe(false);
    expect(result.current.highlightedRowIndex).toBe(null);
  });

  it('应处理索引 add/remove 动画并在到时后清理', async () => {
    const { result } = renderHook(() => useSuggestionAnimation());

    let addPromise: Promise<void>;
    act(() => {
      addPromise = result.current.triggerIndexAnimation('idx_1', 'add');
    });
    expect(result.current.animatingIndexIds.has('idx_1')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(600);
      await addPromise;
    });
    expect(result.current.animatingIndexIds.has('idx_1')).toBe(false);

    let removePromise: Promise<void>;
    act(() => {
      removePromise = result.current.triggerIndexAnimation('idx_2', 'remove');
    });
    expect(result.current.removingIndexIds.has('idx_2')).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(500);
      await removePromise;
    });
    expect(result.current.removingIndexIds.has('idx_2')).toBe(false);
  });

  it('应处理字段 add/remove/modify 动画', async () => {
    const { result } = renderHook(() => useSuggestionAnimation());

    let addPromise: Promise<void>;
    act(() => {
      addPromise = result.current.triggerFieldAnimation('name', 'add');
    });
    expect(result.current.animatingFieldNames.has('name')).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(600);
      await addPromise;
    });
    expect(result.current.animatingFieldNames.has('name')).toBe(false);

    let removePromise: Promise<void>;
    act(() => {
      removePromise = result.current.triggerFieldAnimation('age', 'remove');
    });
    expect(result.current.removingFieldNames.has('age')).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(500);
      await removePromise;
    });
    expect(result.current.removingFieldNames.has('age')).toBe(false);

    let modifyPromise: Promise<void>;
    act(() => {
      modifyPromise = result.current.triggerFieldAnimation('email', 'modify');
    });
    expect(result.current.modifyingFieldNames.has('email')).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(800);
      await modifyPromise;
    });
    expect(result.current.modifyingFieldNames.has('email')).toBe(false);
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

  it('clearAllAnimations 应立即清空状态并取消后续动画', () => {
    const { result } = renderHook(() => useSuggestionAnimation());

    act(() => {
      result.current.triggerIndexAnimation('idx_3', 'add');
      result.current.triggerFieldAnimation('phone', 'modify');
      result.current.triggerFieldTableHighlight(1);
    });

    expect(result.current.animatingIndexIds.has('idx_3')).toBe(true);
    expect(result.current.modifyingFieldNames.has('phone')).toBe(true);
    expect(result.current.isFieldTableHighlighted).toBe(true);

    act(() => {
      result.current.clearAllAnimations();
    });

    expect(result.current.animatingIndexIds.size).toBe(0);
    expect(result.current.modifyingFieldNames.size).toBe(0);
    expect(result.current.isFieldTableHighlighted).toBe(false);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.animatingIndexIds.size).toBe(0);
    expect(result.current.modifyingFieldNames.size).toBe(0);
    expect(result.current.isFieldTableHighlighted).toBe(false);
  });
});
