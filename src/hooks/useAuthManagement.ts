import { useState, useCallback, useEffect } from "react";

export interface UseAuthManagementReturn {
  authInput: string;
  authObjects: string[];
  setAuthInput: (value: string) => void;
  addAuthObject: (authObj: string) => void;
  removeAuthObject: (index: number) => void;
}

export function useAuthManagement(persistedState?: {
  authInput?: string;
  authObjects?: string[];
}): UseAuthManagementReturn {
  const [authInput, setAuthInput] = useState("");
  const [authObjects, setAuthObjects] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Update state when persisted data becomes available
  useEffect(() => {
    if (persistedState && !initialized) {
      if (persistedState.authInput) setAuthInput(persistedState.authInput);
      if (persistedState.authObjects) setAuthObjects(persistedState.authObjects);
      setInitialized(true);
    }
  }, [persistedState, initialized]);

  const addAuthObject = useCallback(
    (authObj: string) => {
      if (authObj.trim() && !authObjects.includes(authObj.trim())) {
        setAuthObjects((prev) => [...prev, authObj.trim()]);
        setAuthInput("");
      }
    },
    [authObjects]
  );

  const removeAuthObject = useCallback((index: number) => {
    setAuthObjects((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    authInput,
    authObjects,
    setAuthInput,
    addAuthObject,
    removeAuthObject,
  };
}