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
      workspaceId?: string;
    };

export type WorkspaceEntityType = 'draft' | 'saved_table' | 'saved_draft' | 'folder';

export type WorkspaceEntityOperation = 'upsert' | 'delete';

export type WorkspaceEntityEnvelope<TPayload = unknown> = {
  workspaceId: string;
  entityType: WorkspaceEntityType;
  entityId: string;
  version: number;
  contentHash: string | null;
  payload: TPayload | null;
  deletedAt?: number;
  updatedAt: number;
};

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

export type WorkspaceChangesResponse = {
  workspaceId: string;
  cursor: number;
  entities: Array<WorkspaceEntityEnvelope<unknown>>;
};

export type WorkspaceChangesPushRequest = {
  changes: Array<{
    clientMutationId: string;
    entityType: WorkspaceEntityType;
    entityId: string;
    op: WorkspaceEntityOperation;
    baseVersion: number | null;
    contentHash: string | null;
    payload: unknown;
  }>;
};

export type WorkspaceChangesPushResponse = {
  cursor: number;
  accepted: Array<{
    clientMutationId: string;
    entityType: WorkspaceEntityType;
    entityId: string;
    version: number;
  }>;
  conflicts: Array<{
    clientMutationId: string;
    entityType: WorkspaceEntityType;
    entityId: string;
    serverVersion: number;
    serverContentHash: string | null;
    serverPayload: unknown;
  }>;
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
