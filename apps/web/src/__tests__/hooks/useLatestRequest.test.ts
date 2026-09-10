import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLatestRequest } from '@/hooks/useLatestRequest';

describe('useLatestRequest', () => {
  it('aborts the active request on unmount and ignores its result', async () => {
    let activeSignal: AbortSignal | undefined;
    let completeRequest!: (value: string) => void;

    const task = new Promise<string>((resolve) => {
      completeRequest = resolve;
    });
    const { result, unmount } = renderHook(() => useLatestRequest());

    let request!: Promise<string | null>;
    act(() => {
      request = result.current.run(({ signal }) => {
        activeSignal = signal;

        return task;
      });
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    unmount();
    expect(activeSignal?.aborted).toBe(true);

    completeRequest('late result');
    await expect(request).resolves.toBeNull();
  });
});
