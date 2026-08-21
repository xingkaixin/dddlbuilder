import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSource } from '@ddlbuilder/shared-types/workspace';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

const PERSIST_DEBOUNCE_MS = 500;

interface UsePersistedSyncParams {
  hydrated: boolean;
  hasOpenTab: boolean;
  persistedState: PersistedState | null;
  activeSource: WorkspaceSource;
  saveState: (payload: WorkspaceSavePayload) => void;
  buildPersistedState: () => PersistedState;
  applyPersistedState: (state: PersistedState) => void;
  updateActiveTabSnapshot?: (state: PersistedState, isDirty: boolean) => void;
}

export function usePersistedSync({
  hydrated,
  hasOpenTab,
  persistedState,
  activeSource,
  saveState,
  buildPersistedState,
  applyPersistedState,
  updateActiveTabSnapshot,
}: UsePersistedSyncParams) {
  const activeSourceRef = useRef(activeSource);
  activeSourceRef.current = activeSource;
  const buildPersistedStateRef = useRef(buildPersistedState);
  buildPersistedStateRef.current = buildPersistedState;
  const browserOfflineRef = useRef(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const latestSaveInputsRef = useRef({
    hydrated,
    hasOpenTab,
    persistedState,
    saveState,
    updateActiveTabSnapshot,
  });
  latestSaveInputsRef.current = {
    hydrated,
    hasOpenTab,
    persistedState,
    saveState,
    updateActiveTabSnapshot,
  };
  const lastAppliedBuildPersistedStateRef = useRef<(() => PersistedState) | null>(null);
  const lastSavedBuildPersistedStateRef = useRef<(() => PersistedState) | null>(null);

  const saveCurrentState = useCallback(() => {
    const {
      hydrated: latestHydrated,
      hasOpenTab: latestHasOpenTab,
      saveState: latestSaveState,
      updateActiveTabSnapshot: latestUpdateActiveTabSnapshot,
    } = latestSaveInputsRef.current;
    if (!latestHydrated) return;
    if (!latestHasOpenTab) return;
    const source = activeSourceRef.current;
    if (lastSavedBuildPersistedStateRef.current === buildPersistedStateRef.current) return;
    const lastAppliedBuildPersistedState = lastAppliedBuildPersistedStateRef.current;
    if (lastAppliedBuildPersistedState) {
      if (lastAppliedBuildPersistedState === buildPersistedStateRef.current) {
        return;
      }
      lastAppliedBuildPersistedStateRef.current = null;
    }

    try {
      const state = buildPersistedStateRef.current();
      const currentSignature = serializePersistedStateForComparison(state);
      const isDirty =
        source.kind === 'saved_table' ? currentSignature !== source.baseSignature : false;
      latestSaveState({
        state,
        source,
        isDirty,
      });
      latestUpdateActiveTabSnapshot?.(state, isDirty);
      lastSavedBuildPersistedStateRef.current = buildPersistedStateRef.current;
    } catch {
      // ignore quota errors
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !persistedState) return;
    lastAppliedBuildPersistedStateRef.current = buildPersistedStateRef.current;
    applyPersistedState(persistedState);
  }, [hydrated, persistedState, applyPersistedState]);

  useEffect(() => {
    if (!hydrated || !hasOpenTab) return;
    if (!lastAppliedBuildPersistedStateRef.current) return;
    if (lastAppliedBuildPersistedStateRef.current === buildPersistedState) return;
    lastAppliedBuildPersistedStateRef.current = null;
    const appliedState = latestSaveInputsRef.current.persistedState;
    if (
      appliedState?.rows &&
      serializePersistedStateForComparison(appliedState as PersistedState) ===
        serializePersistedStateForComparison(buildPersistedState())
    ) {
      lastSavedBuildPersistedStateRef.current = buildPersistedState;
    }
  }, [buildPersistedState, hasOpenTab, hydrated]);

  useEffect(() => {
    if (lastSavedBuildPersistedStateRef.current === buildPersistedState) return;
    lastSavedBuildPersistedStateRef.current = null;
  }, [buildPersistedState]);

  useLayoutEffect(() => {
    if (browserOfflineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      saveCurrentState();
    }
  }, [buildPersistedState, saveCurrentState]);

  useDebouncedEffect(
    () => {
      saveCurrentState();
    },
    [
      hydrated,
      hasOpenTab,
      buildPersistedState,
      saveState,
      updateActiveTabSnapshot,
      saveCurrentState,
    ],
    PERSIST_DEBOUNCE_MS,
  );

  useEffect(() => {
    const handleOnline = () => {
      saveCurrentState();
      browserOfflineRef.current = false;
    };
    const handleOffline = () => {
      browserOfflineRef.current = true;
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentState();
      }
    };
    const handleFieldRowsCommitted = () => {
      window.setTimeout(saveCurrentState, 50);
    };
    window.addEventListener('online', handleOnline, { capture: true });
    window.addEventListener('offline', handleOffline);
    window.addEventListener('blur', saveCurrentState);
    window.addEventListener('pagehide', saveCurrentState);
    window.addEventListener('ddlbuilder:field-rows-committed', handleFieldRowsCommitted);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline, true);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('blur', saveCurrentState);
      window.removeEventListener('pagehide', saveCurrentState);
      window.removeEventListener('ddlbuilder:field-rows-committed', handleFieldRowsCommitted);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveCurrentState]);
}
