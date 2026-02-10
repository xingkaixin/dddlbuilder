import { useState, useEffect, useCallback, useRef } from 'react';
import type { PersistedState } from '@/types';
import { STORAGE_KEY } from '@/utils/constants';

export interface UsePersistedStateReturn {
  persistedState: Partial<PersistedState> | null;
  hydrated: boolean;
  saveState: (state: Partial<PersistedState>) => void;
  clearState: () => void;
}

export function usePersistedState(): UsePersistedStateReturn {
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] =
    useState<Partial<PersistedState> | null>(null);
  const hydratedRef = useRef(false);

  const restoreState = useCallback(() => {
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
  }, []);

  const saveState = useCallback((state: Partial<PersistedState>) => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, []);

  const clearState = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setPersistedState(null);
    } catch {
      // ignore localStorage errors
    }
  }, []);

  // restore from localStorage or URL once on mount
  useEffect(() => {
    const hydrateWithState = (state: Partial<PersistedState> | null) => {
      setPersistedState(state);
      setHydrated(true);
      hydratedRef.current = true;
    };

    const clearShareParamFromUrl = () => {
      const url = new URL(window.location.href);
      if (!url.searchParams.has('s')) return;
      url.searchParams.delete('s');
      const query = url.searchParams.toString();
      const nextUrl = `${url.pathname}${query ? `?${query}` : ''}${url.hash}`;
      window.history.replaceState({}, '', nextUrl);
    };

    // Check for URL parameter first
    const params = new URLSearchParams(window.location.search);
    const shareParam = params.get('s');

    if (shareParam) {
      import('@/utils/share')
        .then(({ decompressState }) => {
          const sharedState = decompressState(shareParam);
          if (sharedState) {
            hydrateWithState(sharedState);
            // Save to localStorage so it persists
            saveState(sharedState);
            return;
          }
          // If decompression fails, fall back to localStorage
          hydrateWithState(restoreState());
        })
        .catch(() => {
          hydrateWithState(restoreState());
        })
        .finally(() => {
          clearShareParamFromUrl();
        });
    } else {
      hydrateWithState(restoreState());
    }
  }, [restoreState, saveState]);

  return {
    persistedState,
    hydrated,
    saveState,
    clearState,
  };
}
