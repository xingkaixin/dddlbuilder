import { useState, useCallback, useRef, useEffect } from 'react';

const TOAST_DURATION_MS = 2800;

export interface UseToastReturn {
  toastMessage: string;
  showToast: (msg: string) => void;
}

export function useToast(): UseToastReturn {
  const hideTimerRef = useRef<number | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState('');

  const showToast = useCallback((msg: string) => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    setToastMessage(msg);
    hideTimerRef.current = window.setTimeout(
      () => setToastMessage(''),
      TOAST_DURATION_MS,
    );
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, []);

  return {
    toastMessage,
    showToast,
  };
}
