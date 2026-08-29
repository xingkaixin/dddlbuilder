import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLatestRequest } from '@/hooks/useLatestRequest';

describe('useLatestRequest', () => {
  it('aborts the active request on unmount and ignores its result', async () => {
    const activeRequest: { signal?: AbortSignal } = {};
    let completeRequest!: (value: string) => void;
    const task = new Promise<string>((resolve) => {
      completeRequest = resolve;
    });
    const { result, unmount } = renderHook(() => useLatestRequest());

    let request!: Promise<string | null>;
    act(() => {
      request = result.current.run(({ signal }) => {
        activeRequest.signal = signal;
        return task;
      });
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));

    unmount();
    expect(activeRequest.signal?.aborted).toBe(true);

    completeRequest('late result');
    await expect(request).resolves.toBeNull();
  });
});
