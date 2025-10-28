import { useState, useEffect } from "react";
import type { PersistedState, FieldRow, IndexField, IndexDefinition } from "@/types";
import { STORAGE_KEY } from "@/utils/constants";
import {
  sanitizeRowsForPersist,
} from "@/utils/helpers";
import { sanitizeIndexesForPersist } from "@/utils/indexUtils";

export interface UsePersistedStateReturn {
  persistedState: Partial<PersistedState> | null;
  hydrated: boolean;
  saveState: (state: Partial<PersistedState>) => void;
  clearState: () => void;
}

export function usePersistedState(): UsePersistedStateReturn {
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] = useState<Partial<PersistedState> | null>(null);

  const restoreState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedState>;
        return parsed;
      }
    } catch {
      // ignore corrupted localStorage
    }
    return null;
  };

  const saveState = (state: Partial<PersistedState>) => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  };

  const clearState = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setPersistedState(null);
    } catch {
      // ignore localStorage errors
    }
  };

  // restore from localStorage once on mount
  useEffect(() => {
    const data = restoreState();
    setPersistedState(data);
    setHydrated(true);
  }, []);

  return {
    persistedState,
    hydrated,
    saveState,
    clearState,
  };
}