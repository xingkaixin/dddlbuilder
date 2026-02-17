import { useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import type { PersistedState } from '@/types';
import { buildShareStateQueryKey } from '@/queryKeys/share';
import { ShareApiError, getShareState } from '@/services/shareService';
import { STORAGE_KEY } from '@/utils/constants';

const SHARE_CACHE_GC_TIME_MS = 15 * 60 * 1000;
const SHARE_UUID_REGEX =
  /^\/share\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

type ShareLoadStatus = 'idle' | 'not_found' | 'error';

const readStateFromStorage = (key: string): Partial<PersistedState> | null => {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      return parsed;
    }
  } catch {
    // ignore corrupted localStorage
  }
  return null;
};

const buildShareStorageKey = (shareId: string) =>
  `${STORAGE_KEY}:share:${shareId}`;

const parseSharePath = (
  pathname: string,
): { shareId: string | null; invalid: boolean } => {
  if (!pathname.startsWith('/share/')) {
    return { shareId: null, invalid: false };
  }
  const match = pathname.match(SHARE_UUID_REGEX);
  if (!match) {
    return { shareId: null, invalid: true };
  }
  return { shareId: match[1], invalid: false };
};

export interface UsePersistedStateReturn {
  persistedState: Partial<PersistedState> | null;
  hydrated: boolean;
  saveState: (state: Partial<PersistedState>) => void;
  clearState: () => void;
  shareLoadStatus: ShareLoadStatus;
  isShareView: boolean;
}

export function usePersistedState(): UsePersistedStateReturn {
  const queryClient = useQueryClient();
  const pathInfo = parseSharePath(window.location.pathname);
  const shareId = pathInfo.shareId;
  const storageKey = shareId ? buildShareStorageKey(shareId) : STORAGE_KEY;
  const [hydrated, setHydrated] = useState(false);
  const [persistedState, setPersistedState] =
    useState<Partial<PersistedState> | null>(null);
  const [shareLoadStatus, setShareLoadStatus] =
    useState<ShareLoadStatus>('idle');

  const restoreState = useCallback(() => {
    return readStateFromStorage(storageKey);
  }, [storageKey]);

  const restoreMainState = useCallback(() => {
    return readStateFromStorage(STORAGE_KEY);
  }, []);

  const writeStateToStorage = useCallback(
    (state: Partial<PersistedState>) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // ignore quota errors
      }
    },
    [storageKey],
  );

  const saveState = useCallback(
    (state: Partial<PersistedState>) => {
      if (!hydrated) return;
      writeStateToStorage(state);
    },
    [hydrated, writeStateToStorage],
  );

  const clearState = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setPersistedState(null);
    } catch {
      // ignore localStorage errors
    }
  }, [storageKey]);

  // restore from localStorage or share link once on mount
  useEffect(() => {
    let cancelled = false;

    const hydrateWithState = (state: Partial<PersistedState> | null) => {
      if (cancelled) return;
      setPersistedState(state);
      setHydrated(true);
    };

    const redirectHome = () => {
      window.history.replaceState({}, '', '/');
    };

    if (pathInfo.invalid) {
      setShareLoadStatus('error');
      redirectHome();
      hydrateWithState(restoreMainState());
      return () => {
        cancelled = true;
      };
    }

    if (!shareId) {
      hydrateWithState(restoreState());
      return () => {
        cancelled = true;
      };
    }

    queryClient
      .fetchQuery({
        queryKey: buildShareStateQueryKey(shareId),
        staleTime: Number.POSITIVE_INFINITY,
        gcTime: SHARE_CACHE_GC_TIME_MS,
        queryFn: () => getShareState(shareId),
      })
      .then((state) => {
        hydrateWithState(state);
        writeStateToStorage(state);
      })
      .catch((error) => {
        if (
          error instanceof ShareApiError &&
          error.code === 'SHARE_NOT_FOUND'
        ) {
          setShareLoadStatus('not_found');
        } else {
          setShareLoadStatus('error');
        }
        redirectHome();
        hydrateWithState(restoreMainState());
      });

    return () => {
      cancelled = true;
    };
  }, [
    pathInfo.invalid,
    shareId,
    queryClient,
    restoreState,
    restoreMainState,
    writeStateToStorage,
  ]);

  return {
    persistedState,
    hydrated,
    saveState,
    clearState,
    shareLoadStatus,
    isShareView: Boolean(shareId),
  };
}
