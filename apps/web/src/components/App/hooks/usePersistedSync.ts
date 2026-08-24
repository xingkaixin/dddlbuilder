import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { useDebouncedEffect } from '@/hooks/useDebouncedEffect';
import { serializePersistedStateForComparison } from '@/utils/persistedStateSignature';

const PERSIST_DEBOUNCE_MS = 500;

interface UsePersistedSyncParams {
  hydrated: boolean;
  hasOpenTab: boolean;
  persistedState: PersistedState | null;
  activeSource: WorkspaceSelection;
  saveState: (payload: WorkspaceSavePayload) => void;
  currentState: PersistedState;
  getCurrentState: () => PersistedState;
  applyPersistedState: (state: PersistedState) => void;
}

export function usePersistedSync({
  hydrated,
  hasOpenTab,
  persistedState,
  activeSource,
  saveState,
  currentState,
  getCurrentState,
  applyPersistedState,
}: UsePersistedSyncParams) {
  const browserOfflineRef = useRef(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const pendingAppliedStateRef = useRef<{ sourceId: string; signature: string } | null>(null);
  const lastSavedKeyRef = useRef<string | null>(null);
  const currentSignature = useMemo(
    () => serializePersistedStateForComparison(currentState),
    [currentState],
  );
  const sourceId =
    activeSource.kind === 'draft'
      ? `draft:${activeSource.draftId}`
      : `saved_table:${activeSource.normalizedName}`;
  const sourceVersion =
    activeSource.kind === 'draft' ? sourceId : `${sourceId}:${activeSource.baseSignature}`;
  const currentSaveKey = `${sourceVersion}:${currentSignature}`;

  const saveCurrentState = useCallback(() => {
    if (!hydrated || !hasOpenTab) return;
    const pendingAppliedState = pendingAppliedStateRef.current;
    if (pendingAppliedState?.sourceId === sourceId) return;
    const latestState = getCurrentState();
    const latestSignature = serializePersistedStateForComparison(latestState);
    const latestSaveKey = `${sourceVersion}:${latestSignature}`;
    if (lastSavedKeyRef.current === latestSaveKey) return;

    saveState({
      state: latestState,
      source: activeSource,
    });
    lastSavedKeyRef.current = latestSaveKey;
  }, [activeSource, getCurrentState, hasOpenTab, hydrated, saveState, sourceId, sourceVersion]);

  useEffect(() => {
    if (!hydrated || !hasOpenTab || !persistedState) return;
    pendingAppliedStateRef.current = {
      sourceId,
      signature: serializePersistedStateForComparison(persistedState),
    };
    applyPersistedState(persistedState);
  }, [applyPersistedState, hasOpenTab, hydrated, persistedState, sourceId]);

  useEffect(() => {
    const pendingAppliedState = pendingAppliedStateRef.current;
    if (!pendingAppliedState) return;
    if (pendingAppliedState.sourceId !== sourceId) {
      pendingAppliedStateRef.current = null;
      return;
    }
    if (pendingAppliedState.signature !== currentSignature) return;
    pendingAppliedStateRef.current = null;
    lastSavedKeyRef.current = currentSaveKey;
  }, [currentSaveKey, currentSignature, sourceId]);

  useLayoutEffect(() => {
    if (browserOfflineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      saveCurrentState();
    }
  }, [currentSaveKey, saveCurrentState]);

  useDebouncedEffect(
    () => {
      saveCurrentState();
    },
    [hydrated, hasOpenTab, currentSaveKey, saveState, saveCurrentState],
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
    window.addEventListener('online', handleOnline, { capture: true });
    window.addEventListener('offline', handleOffline);
    window.addEventListener('blur', saveCurrentState);
    window.addEventListener('pagehide', saveCurrentState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('online', handleOnline, true);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('blur', saveCurrentState);
      window.removeEventListener('pagehide', saveCurrentState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveCurrentState]);
}
