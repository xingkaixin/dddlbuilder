import { useCallback, useRef, useState } from 'react';

interface UseDialogStateOptions<TData> {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialData: TData;
}

export interface UseDialogStateReturn<TData> {
  open: boolean;
  data: TData;
  error: string;
  openDialog: (nextData?: TData) => void;
  closeDialog: () => void;
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

  const closeDialog = useCallback(() => {
    setOpen(false);
    setData(initialDataRef.current);
    setError('');
  }, [setOpen]);

  return {
    open,
    data,
    error,
    openDialog,
    closeDialog,
    updateData: setData,
    setError,
    clearError,
    resetData,
  };
}
