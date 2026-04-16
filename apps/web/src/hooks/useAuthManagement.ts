import { useEffect } from 'react';
import { useAuthStore } from '@/stores';

export interface UseAuthManagementReturn {
  authInput: string;
  authObjects: string[];
  setAuthInput: (value: string | ((prev: string) => string)) => void;
  addAuthObject: (authObj: string) => void;
  removeAuthObject: (index: number) => void;
  resetAuthState: () => void;
  setAuthObjects: (value: string[] | ((prev: string[]) => string[])) => void;
}

export function useAuthManagement(persistedState?: {
  authInput?: string;
  authObjects?: string[];
}): UseAuthManagementReturn {
  const authInput = useAuthStore((state) => state.authInput);
  const authObjects = useAuthStore((state) => state.authObjects);
  const setAuthInput = useAuthStore((state) => state.setAuthInput);
  const setAuthObjects = useAuthStore((state) => state.setAuthObjects);
  const addAuthObject = useAuthStore((state) => state.addAuthObject);
  const removeAuthObject = useAuthStore((state) => state.removeAuthObject);
  const hydratedFromPersisted = useAuthStore((state) => state.hydratedFromPersisted);
  const markHydratedFromPersisted = useAuthStore((state) => state.markHydratedFromPersisted);
  const resetAuthState = useAuthStore((state) => state.resetAuthState);

  useEffect(() => {
    if (!persistedState || hydratedFromPersisted) return;
    if (persistedState.authInput) setAuthInput(persistedState.authInput);
    if (persistedState.authObjects) setAuthObjects(persistedState.authObjects);
    markHydratedFromPersisted();
  }, [
    hydratedFromPersisted,
    markHydratedFromPersisted,
    persistedState,
    setAuthInput,
    setAuthObjects,
  ]);

  return {
    authInput,
    authObjects,
    setAuthInput,
    addAuthObject,
    removeAuthObject,
    resetAuthState,
    setAuthObjects,
  };
}
