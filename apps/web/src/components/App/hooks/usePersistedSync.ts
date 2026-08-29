import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { WorkspaceSavePayload, WorkspaceSelection } from '@ddlbuilder/shared-types/workspace';
import { buildPersistedStateSignature } from '@/utils/persistedStateSignature';

interface UsePersistedSyncParams {
  hydrated: boolean;
  enabled: boolean;
  persistedState: PersistedState | null;
  activeSource: WorkspaceSelection;
  saveState: (payload: WorkspaceSavePayload) => void;
  currentState: PersistedState;
  getCurrentState: () => PersistedState;
  applyPersistedState: (state: PersistedState) => void;
}

export function usePersistedSync({
  hydrated,
  enabled,
  persistedState,
  activeSource,
  saveState,
  currentState,
  getCurrentState,
  applyPersistedState,
}: UsePersistedSyncParams) {
  const pendingAppliedStateRef = useRef<{ sourceId: string; signature: string } | null>(null);
  const lastSavedKeyRef = useRef<string | null>(null);
  const currentSignature = useMemo(
    () => buildPersistedStateSignature(currentState),
    [currentState],
  );
  const sourceId =
    activeSource.kind === 'draft'
      ? `draft:${activeSource.draftId}`
      : `saved_table:${activeSource.normalizedName}`;
  const sourceVersion =
    activeSource.kind === 'draft' ? sourceId : `${sourceId}:${activeSource.baseSignature}`;
  const currentSaveKey = `${sourceVersion}:${currentSignature}`;

  const saveSnapshot = useCallback(
    (state: PersistedState, saveKey: string) => {
      if (!hydrated || !enabled) return;
      if (pendingAppliedStateRef.current?.sourceId === sourceId) return;
      if (lastSavedKeyRef.current === saveKey) return;
      saveState({ state, source: activeSource });
      lastSavedKeyRef.current = saveKey;
    },
    [activeSource, enabled, hydrated, saveState, sourceId],
  );

  const saveCurrentState = useCallback(() => {
    if (!hydrated || !enabled) return;
    const latestState = getCurrentState();
    saveSnapshot(latestState, `${sourceVersion}:${buildPersistedStateSignature(latestState)}`);
  }, [enabled, getCurrentState, hydrated, saveSnapshot, sourceVersion]);

  useLayoutEffect(() => {
    if (!hydrated || !enabled || !persistedState) return;
    pendingAppliedStateRef.current = {
      sourceId,
      signature: buildPersistedStateSignature(persistedState),
    };
    applyPersistedState(persistedState);
  }, [applyPersistedState, enabled, hydrated, persistedState, sourceId]);

  useLayoutEffect(() => {
    const pendingAppliedState = pendingAppliedStateRef.current;
    if (pendingAppliedState) {
      if (pendingAppliedState.sourceId !== sourceId) {
        pendingAppliedStateRef.current = null;
      } else if (pendingAppliedState.signature === currentSignature) {
        pendingAppliedStateRef.current = null;
        lastSavedKeyRef.current = currentSaveKey;
      }
    }
    saveSnapshot(currentState, currentSaveKey);
  }, [currentSaveKey, currentSignature, currentState, saveSnapshot, sourceId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentState();
      }
    };
    window.addEventListener('blur', saveCurrentState);
    window.addEventListener('pagehide', saveCurrentState);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', saveCurrentState);
      window.removeEventListener('pagehide', saveCurrentState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [saveCurrentState]);
}
