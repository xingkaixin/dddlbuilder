import type { PersistedState } from '@ddlbuilder/shared-types';
import { buildSchemaStateSignature } from '@ddlbuilder/workspace-core';

const MAX_HISTORY_ENTRIES = 50;
const COALESCE_WINDOW_MS = 400;

interface DocumentHistory {
  past: PersistedState[];
  future: PersistedState[];
  current: PersistedState | null;
  currentSignature: string | null;
  lastRecordedAt: number;
}

const histories = new Map<string, DocumentHistory>();
let applyingHistory = false;

const getOrCreateHistory = (documentId: string): DocumentHistory => {
  const existing = histories.get(documentId);

  if (existing) return existing;

  const created: DocumentHistory = {
    past: [],
    future: [],
    current: null,
    currentSignature: null,
    lastRecordedAt: 0,
  };
  histories.set(documentId, created);

  return created;
};

export const isApplyingEditorHistory = () => applyingHistory;

export const runWithEditorHistoryGuard = (fn: () => void) => {
  applyingHistory = true;

  try {
    fn();
  } finally {
    applyingHistory = false;
  }
};

export const seedEditorHistory = (documentId: string, state: PersistedState) => {
  const history = getOrCreateHistory(documentId);
  const signature = buildSchemaStateSignature(state);

  if (history.current === null) {
    history.current = state;
    history.currentSignature = signature;
    history.lastRecordedAt = Date.now();
  }
};

export const recordEditorHistory = (
  documentId: string,
  state: PersistedState,
  now = Date.now(),
) => {
  if (applyingHistory) return;

  const history = getOrCreateHistory(documentId);
  const signature = buildSchemaStateSignature(state);

  if (history.current === null) {
    history.current = state;
    history.currentSignature = signature;
    history.lastRecordedAt = now;

    return;
  }

  if (history.currentSignature === signature) return;

  if (now - history.lastRecordedAt > COALESCE_WINDOW_MS || history.past.length === 0) {
    history.past.push(history.current);

    if (history.past.length > MAX_HISTORY_ENTRIES) {
      history.past.shift();
    }
  }

  history.current = state;
  history.currentSignature = signature;
  history.future = [];
  history.lastRecordedAt = now;
};

export const undoEditorHistory = (documentId: string): PersistedState | null => {
  const history = histories.get(documentId);

  if (!history || history.past.length === 0 || !history.current) return null;

  const previous = history.past.pop();

  if (!previous) return null;

  history.future.push(history.current);
  history.current = previous;
  history.currentSignature = buildSchemaStateSignature(previous);
  history.lastRecordedAt = 0;

  return previous;
};

export const redoEditorHistory = (documentId: string): PersistedState | null => {
  const history = histories.get(documentId);

  if (!history || history.future.length === 0 || !history.current) return null;

  const next = history.future.pop();

  if (!next) return null;

  history.past.push(history.current);
  history.current = next;
  history.currentSignature = buildSchemaStateSignature(next);
  history.lastRecordedAt = 0;

  return next;
};

export const clearEditorHistory = (documentId?: string) => {
  if (documentId) {
    histories.delete(documentId);

    return;
  }

  histories.clear();
};
