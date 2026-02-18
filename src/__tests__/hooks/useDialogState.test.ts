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

function useDialogHarnessWithInitialData(initialData: DialogData) {
  const [open, setOpen] = useState(false);
  return useDialogState<DialogData>({
    open,
    setOpen,
    initialData,
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

    act(() => {
      result.current.updateData({ name: 'users', targetId: '2' });
    });
    expect(result.current.data).toEqual({ name: 'users', targetId: '2' });
  });

  it('should keep first initialData snapshot for reset behavior', () => {
    const { result, rerender } = renderHook(
      ({ initialData }: { initialData: DialogData }) =>
        useDialogHarnessWithInitialData(initialData),
      {
        initialProps: {
          initialData: { name: 'first', targetId: '1' },
        },
      },
    );

    rerender({ initialData: { name: 'second', targetId: '2' } });

    act(() => {
      result.current.openDialog({ name: 'editing', targetId: '9' });
    });

    act(() => {
      result.current.closeDialog();
    });

    expect(result.current.data).toEqual({ name: 'first', targetId: '1' });
  });

  it('should keep data and error when close options disable reset', () => {
    const { result } = renderHook(() => useDialogHarness());

    act(() => {
      result.current.openDialog();
      result.current.updateData({ name: 'temp', targetId: '8' });
      result.current.setError('error');
    });

    expect(result.current.open).toBe(true);
    expect(result.current.data).toEqual({ name: 'temp', targetId: '8' });
    expect(result.current.error).toBe('error');

    act(() => {
      result.current.closeDialog({ resetData: false, clearError: false });
    });

    expect(result.current.open).toBe(false);
    expect(result.current.data).toEqual({ name: 'temp', targetId: '8' });
    expect(result.current.error).toBe('error');
  });
});
