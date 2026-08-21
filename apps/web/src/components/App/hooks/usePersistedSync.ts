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
  applyPersistedState: (state: PersistedState) => void;
}

export function usePersistedSync({
  hydrated,
  hasOpenTab,
  persistedState,
  activeSource,
  saveState,
  currentState,
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
    if (lastSavedKeyRef.current === currentSaveKey) return;

    const isDirty =
      activeSource.kind === 'saved_table' ? currentSignature !== activeSource.baseSignature : false;
    saveState({
      state: currentState,
      source: activeSource,
      isDirty,
    });
    lastSavedKeyRef.current = currentSaveKey;
  }, [
    activeSource,
    currentSaveKey,
    currentSignature,
    currentState,
    hasOpenTab,
    hydrated,
    saveState,
    sourceId,
  ]);

  useEffect(() => {
    if (!hydrated || !persistedState) return;
    pendingAppliedStateRef.current = {
      sourceId,
      signature: serializePersistedStateForComparison(persistedState),
    };
    applyPersistedState(persistedState);
  }, [applyPersistedState, hydrated, persistedState, sourceId]);

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
