import { useCallback, useReducer } from 'react';

interface UseDialogStateOptions<TData> {
  open: boolean;
  setOpen: (open: boolean) => void;
  initialData: TData;
}

type DataUpdate<TData> = TData | ((prev: TData) => TData);

export interface UseDialogStateReturn<TData> {
  open: boolean;
  data: TData;
  error: string;
  openDialog: (nextData?: TData) => void;
  closeDialog: () => void;
  updateData: (next: DataUpdate<TData>) => void;
  setError: (message: string) => void;
  clearError: () => void;
  resetData: () => void;
}

interface DialogState<TData> {
  initialData: TData;
  data: TData;
  error: string;
}

type DialogEvent<TData> =
  | { type: 'opened'; data?: TData }
  | { type: 'closed' | 'dataReset' | 'errorCleared' }
  | { type: 'dataEdited'; update: DataUpdate<TData> }
  | { type: 'errorReported'; error: string };

const isDataUpdater = <TData>(update: DataUpdate<TData>): update is (prev: TData) => TData =>
  typeof update === 'function';

const createDialogState = <TData>(initialData: TData): DialogState<TData> => ({
  initialData,
  data: initialData,
  error: '',
});

function dialogReducer<TData>(
  state: DialogState<TData>,
  event: DialogEvent<TData>,
): DialogState<TData> {
  switch (event.type) {
    case 'opened':
      return {
        ...state,
        data: event.data === undefined ? state.data : event.data,
        error: '',
      };
    case 'closed':
      return { ...state, data: state.initialData, error: '' };
    case 'dataReset':
      return { ...state, data: state.initialData };
    case 'errorCleared':
      return { ...state, error: '' };
    case 'dataEdited':
      return {
        ...state,
        data: isDataUpdater(event.update) ? event.update(state.data) : event.update,
      };
    case 'errorReported':
      return { ...state, error: event.error };
  }
}

export function useDialogState<TData>(
  options: UseDialogStateOptions<TData>,
): UseDialogStateReturn<TData> {
  const { open, setOpen, initialData } = options;

  const [{ data, error }, dispatch] = useReducer(
    dialogReducer<TData>,
    initialData,
    createDialogState,
  );

  const resetData = useCallback(() => {
    dispatch({ type: 'dataReset' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'errorCleared' });
  }, []);

  const setError = useCallback((message: string) => {
    dispatch({ type: 'errorReported', error: message });
  }, []);

  const updateData = useCallback((next: DataUpdate<TData>) => {
    dispatch({ type: 'dataEdited', update: next });
  }, []);

  const openDialog = useCallback(
    (nextData?: TData) => {
      dispatch({ type: 'opened', data: nextData });
      setOpen(true);
    },
    [setOpen],
  );

  const closeDialog = useCallback(() => {
    setOpen(false);
    dispatch({ type: 'closed' });
  }, [setOpen]);

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
