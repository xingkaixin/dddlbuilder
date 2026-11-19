import type { PersistedState } from '@ddlbuilder/shared-types';
import { useEditorStore } from '@/stores/editorStore';
import { toPersistedState } from '@/stores/editorDocumentCodec';
import { runWithEditorHistoryGuard, seedEditorHistory } from '@/stores/editorHistory';
import { useTabStore } from '@/stores/tabStore';

export function loadEditorSnapshot(state: PersistedState) {
  runWithEditorHistoryGuard(() => applySavedState(state));
  const tab = useTabStore.getState().getActiveTab();

  if (tab && !tab.isLoading) seedEditorHistory(tab.id, toPersistedState(useEditorStore.getState()));
}

export function applySavedState(state: PersistedState) {
  useEditorStore.getState().replaceDocument(state);
}
