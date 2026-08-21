import type { PersistedState } from './index.js';

export type WorkspaceSource =
  | { kind: 'draft'; draftId: string }
  | { kind: 'saved_table'; normalizedName: string };

export type WorkspaceSelection =
  | Extract<WorkspaceSource, { kind: 'draft' }>
  | (Extract<WorkspaceSource, { kind: 'saved_table' }> & {
      tableName: string;
      baseSignature: string;
    });

export type WorkspaceScope =
  | { kind: 'anonymous' }
  | {
      kind: 'user';
      userId: string;
      workspaceId?: string;
    };

export type WorkspaceEntityType = 'draft' | 'saved_table' | 'saved_draft' | 'folder';

export type WorkspaceListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  activeAt?: number;
  updatedAt: number;
};

export type WorkspaceListResponse = {
  workspaces: WorkspaceListItem[];
  activeWorkspaceId: string;
};

export type WorkspaceSavePayload = {
  state: PersistedState;
  source: WorkspaceSelection;
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
  createdAt: number;
  updatedAt: number;
  folderId?: string;
  trashedAt?: number;
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
  drafts: Array<{
    draftId: string;
    state: PersistedState;
    createdAt?: number;
    updatedAt: number;
    folderId?: string;
  }>;
  savedTables: Array<{
    normalizedName: string;
    name: string;
    state: PersistedState;
    createdAt?: number;
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
