import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePersistenceQueue } from '@/hooks/workspacePersistence/usePersistenceQueue';

describe('usePersistenceQueue', () => {
  it('失败后保留任务并允许重试', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const task = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce();
    const { result } = renderHook(() => usePersistenceQueue());

    let completion!: Promise<unknown>;
    act(() => {
      completion = result.current.enqueue('draft:default', 'save draft', task);
    });

    await expect(completion).rejects.toThrow('quota');

    await waitFor(() => {
      expect(result.current.failure?.operation).toBe('save draft');
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[workspace-persistence] save draft failed',
      expect.any(Error),
    );

    act(() => {
      result.current.retryFailed();
    });

    await waitFor(() => {
      expect(task).toHaveBeenCalledTimes(2);
      expect(result.current.failure).toBeNull();
    });
  });

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
