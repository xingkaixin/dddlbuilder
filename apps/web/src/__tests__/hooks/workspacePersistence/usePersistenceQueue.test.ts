import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePersistenceQueue } from '@/hooks/workspacePersistence/usePersistenceQueue';

describe('usePersistenceQueue', () => {
  it('同一实体的操作按提交顺序执行', async () => {
    let finishFirst!: () => void;

    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const second = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePersistenceQueue());

    act(() => {
      result.current.enqueue('draft:default', 'save draft', first);
      result.current.enqueue('draft:default', 'delete draft', second);
    });

    await waitFor(() => expect(first).toHaveBeenCalledOnce());
    expect(second).not.toHaveBeenCalled();

    act(() => finishFirst());

    await waitFor(() => expect(second).toHaveBeenCalledOnce());
  });
});
