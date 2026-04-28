import type { PersistedState } from './index.js';

export type WorkspaceSource =
  | { kind: 'draft'; draftId: string }
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

export type DraftSummary = {
  draftId: string;
  name: string;
  dbType: string;
  fieldCount: number;
  updatedAt: number;
  folderId?: string;
};

export type TableFolderSnapshot = {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  createdAt: number;
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
    folderId?: string;
  }>;
  savedDrafts: Array<{
    normalizedName: string;
    tableName: string;
    state: PersistedState;
    updatedAt: number;
    baseSignature: string;
  }>;
  folders: TableFolderSnapshot[];
};
