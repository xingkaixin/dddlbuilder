import type React from 'react';
import { useCallback } from 'react';
import { toast, type ExternalToast } from 'sonner';

export interface UseToastReturn {
  /**
   * Show a success toast
   */
  success: (msg: string | React.ReactNode, options?: ExternalToast) => void;
  /**
   * Show an error toast
   */
  error: (msg: string | React.ReactNode, options?: ExternalToast) => void;
  /**
   * Show an info toast
   */
  info: (msg: string | React.ReactNode, options?: ExternalToast) => void;
  /**
   * Show a warning toast
   */
  warning: (msg: string | React.ReactNode, options?: ExternalToast) => void;
  /**
   * Show a promise toast
   */
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    data?: {
      loading?: string | React.ReactNode;
      success?:
        | string
        | React.ReactNode
        | ((data: T) => string | React.ReactNode);
      error?:
        | string
        | React.ReactNode
        | ((error: any) => string | React.ReactNode);
    },
    options?: ExternalToast,
  ) => void;
  /**
   * Generic toast message (default)
   */
  showToast: (msg: string | React.ReactNode, options?: ExternalToast) => void;
  /**
   * Dismiss a specific toast or all toasts
   */
  dismiss: (id?: string | number) => void;
}

export function useToast(): UseToastReturn {
  const showToast = useCallback(
    (msg: string | React.ReactNode, options?: ExternalToast) => {
      toast(msg, options);
    },
    [],
  );

  const success = useCallback(
    (msg: string | React.ReactNode, options?: ExternalToast) => {
      toast.success(msg, options);
    },
    [],
  );

  const error = useCallback(
    (msg: string | React.ReactNode, options?: ExternalToast) => {
      toast.error(msg, options);
    },
    [],
  );

  const info = useCallback(
    (msg: string | React.ReactNode, options?: ExternalToast) => {
      toast.info(msg, options);
    },
    [],
  );

  const warning = useCallback(
    (msg: string | React.ReactNode, options?: ExternalToast) => {
      toast.warning(msg, options);
    },
    [],
  );

  const promise = useCallback(
    <T>(
      promise: Promise<T> | (() => Promise<T>),
      data?: {
        loading?: string | React.ReactNode;
        success?:
          | string
          | React.ReactNode
          | ((data: T) => string | React.ReactNode);
        error?:
          | string
          | React.ReactNode
          | ((error: any) => string | React.ReactNode);
      },
      options?: ExternalToast,
    ) => {
      toast.promise(promise, { ...data, ...options });
    },
    [],
  );

  const dismiss = useCallback((id?: string | number) => {
    toast.dismiss(id);
  }, []);

  return {
    showToast,
    success,
    error,
    info,
    warning,
    promise,
    dismiss,
  };
}
