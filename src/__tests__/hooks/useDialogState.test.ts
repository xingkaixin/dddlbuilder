import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useState } from 'react';
import { useDialogState } from '@/hooks/useDialogState';

interface DialogData {
  name: string;
  targetId: string | null;
}

function useDialogHarness() {
  const [open, setOpen] = useState(false);
  return useDialogState<DialogData>({
    open,
    setOpen,
    initialData: {
      name: '',
      targetId: null,
    },
  });
}

describe('useDialogState', () => {
  it('should open and close dialog with data reset', () => {
    const { result } = renderHook(() => useDialogHarness());

    expect(result.current.open).toBe(false);
    expect(result.current.data).toEqual({ name: '', targetId: null });

    act(() => {
      result.current.openDialog({ name: 'users', targetId: '1' });
    });

    expect(result.current.open).toBe(true);
    expect(result.current.data).toEqual({ name: 'users', targetId: '1' });

    act(() => {
      result.current.closeDialog();
    });

    expect(result.current.open).toBe(false);
    expect(result.current.data).toEqual({ name: '', targetId: null });
  });

  it('should update and clear error state', () => {
    const { result } = renderHook(() => useDialogHarness());

    act(() => {
      result.current.setError('名称已存在');
    });
    expect(result.current.error).toBe('名称已存在');

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBe('');

    act(() => {
      result.current.updateData((prev) => ({ ...prev, name: 'orders' }));
    });
    expect(result.current.data.name).toBe('orders');
  });
});
