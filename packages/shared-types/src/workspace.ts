import type { PersistedState } from './index.js';

export type WorkspaceSource =
  | { kind: 'global_draft' }
  | {
      kind: 'saved_table';
      normalizedName: string;
      tableName: string;
      baseSignature: string;
    };

export type WorkspaceScope =
  | { kind: 'anonymous' }
  | {
      kind: 'user';
      userId: string;
    };

export type WorkspaceSavePayload = {
  state: PersistedState;
  source: WorkspaceSource;
  isDirty: boolean;
};

export type SavedTableDraftRecord = {
  state: PersistedState;
  tableName: string;
  baseSignature: string;
  updatedAt: number;
};

export type GlobalDraftSummary = {
  name: string;
  dbType: string;
  fieldCount: number;
  updatedAt: number;
};

export type WorkspaceSnapshot = {
  globalDraft: {
    state: PersistedState;
    updatedAt: number;
  } | null;
  savedTables: Array<{
    normalizedName: string;
    name: string;
    state: PersistedState;
    updatedAt: number;
  }>;
  savedDrafts: Array<{
    normalizedName: string;
    tableName: string;
    state: PersistedState;
    updatedAt: number;
    baseSignature: string;
  }>;
};
