import { useCallback, useRef, useState } from 'react';

interface UseDialogStateOptions<TData> {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialData: TData;
}

interface CloseDialogOptions {
  resetData?: boolean;
  clearError?: boolean;
}

export interface UseDialogStateReturn<TData> {
  open: boolean;
  data: TData;
  error: string;
  openDialog: (nextData?: TData) => void;
  closeDialog: (options?: CloseDialogOptions) => void;
  updateData: (next: TData | ((prev: TData) => TData)) => void;
  setError: (message: string) => void;
  clearError: () => void;
  resetData: () => void;
}

export function useDialogState<TData>(
  options: UseDialogStateOptions<TData>,
): UseDialogStateReturn<TData> {
  const { open, setOpen, initialData } = options;
  const initialDataRef = useRef(initialData);
  const [data, setData] = useState<TData>(() => initialData);
  const [error, setError] = useState('');

  const resetData = useCallback(() => {
    setData(initialDataRef.current);
  }, []);

  const clearError = useCallback(() => {
    setError('');
  }, []);

  const updateData = useCallback((next: TData | ((prev: TData) => TData)) => {
    if (typeof next === 'function') {
      setData((prev) => (next as (prev: TData) => TData)(prev));
      return;
    }
    setData(next);
  }, []);

  const openDialog = useCallback(
    (nextData?: TData) => {
      if (nextData !== undefined) {
        setData(nextData);
      }
      setError('');
      setOpen(true);
    },
    [setOpen],
  );

  const closeDialog = useCallback(
    (closeOptions?: CloseDialogOptions) => {
      const shouldResetData = closeOptions?.resetData ?? true;
      const shouldClearError = closeOptions?.clearError ?? true;

      setOpen(false);
      if (shouldResetData) {
        setData(initialDataRef.current);
      }
      if (shouldClearError) {
        setError('');
      }
    },
    [setOpen],
  );

  return {
    open,
    data,
    error,
    openDialog,
    closeDialog,
    updateData,
    setError,
    clearError,
    resetData,
  };
}
