import type { PersistedState } from '@ddlbuilder/shared-types';
import { useEditorStore } from '@/stores';

export function applySavedState(state: PersistedState) {
  useEditorStore.getState().replaceDocument(state);
}
