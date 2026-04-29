export type ApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_AUTH_TOKEN'
  | 'USER_DISABLED'
  | 'CREDIT_EXHAUSTED'
  | 'TURNSTILE_REQUIRED'
  | 'TURNSTILE_FAILED'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_JSON'
  | 'SQL_REQUIRED'
  | 'SQL_TOO_LONG'
  | 'INVALID_DATABASE_TYPE'
  | 'SQL_PARSE_FAILED'
  | 'OPENAI_API_KEY_MISSING'
  | 'EXPLAIN_FAILED'
  | 'REVIEW_FAILED'
  | 'GENERATION_FAILED'
  | 'DESCRIPTION_REQUIRED'
  | 'SCHEMA_REQUIRED'
  | 'DDL_REQUIRED'
  | 'REDIS_CONFIG_MISSING'
  | 'SHARE_STATE_REQUIRED'
  | 'SHARE_STATE_INVALID'
  | 'SHARE_UUID_INVALID'
  | 'SHARE_NOT_FOUND'
  | 'SHARE_STORE_FAILED'
  | 'SHARE_LOAD_FAILED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'BUDGET_EXCEEDED'
  | 'UPSTREAM_OPENAI_ERROR'
  | 'SERVICE_UNAVAILABLE';

export type ApiMeta = {
  requestId?: string;
};

export type ApiErrorPayload = {
  error: string;
  code?: ApiErrorCode;
  requestId?: string;
};

export type WorkspaceMigrationConflict = {
  kind: 'draft' | 'saved_table' | 'saved_draft';
  normalizedName: string | null;
  displayName: string;
};

export type WorkspaceMigrationResponse = {
  status: 'no_data' | 'ready' | 'completed';
  createdCount: number;
  copiedCount: number;
  skippedCount: number;
  conflictCount: number;
  conflicts: WorkspaceMigrationConflict[];
  meta?: ApiMeta;
};

export type WorkspaceSnapshotItem = {
  normalizedName: string;
  name: string;
  state: Record<string, unknown>;
  updatedAt: number;
  folderId?: string;
};

export type WorkspaceSavedDraftSnapshotItem = {
  normalizedName: string;
  tableName: string;
  state: Record<string, unknown>;
  updatedAt: number;
  baseSignature: string;
};

export type WorkspaceDraftSnapshotItem = {
  draftId: string;
  state: Record<string, unknown>;
  updatedAt: number;
  folderId?: string;
};

export type WorkspaceFolderSnapshotItem = {
  id: string;
  name: string;
  parentId?: string;
  order: number;
  createdAt: number;
};

export type WorkspaceSnapshotResponse = {
  globalDraft: {
    state: Record<string, unknown>;
    updatedAt: number;
  } | null;
  drafts: WorkspaceDraftSnapshotItem[];
  savedTables: WorkspaceSnapshotItem[];
  savedDrafts: WorkspaceSavedDraftSnapshotItem[];
  folders: WorkspaceFolderSnapshotItem[];
  meta?: ApiMeta;
};

export type WorkspaceSnapshotPushRequest = {
  globalDraft: {
    state: Record<string, unknown>;
    updatedAt: number;
  } | null;
  drafts: WorkspaceDraftSnapshotItem[];
  savedTables: WorkspaceSnapshotItem[];
  savedDrafts: WorkspaceSavedDraftSnapshotItem[];
  folders: WorkspaceFolderSnapshotItem[];
};

export type MeApiResponse =
  | {
      signedIn: false;
      user: null;
      meta?: ApiMeta;
    }
  | {
      signedIn: true;
      user: {
        userId: string;
        email: string;
        emailVerified: boolean;
        name: string;
      };
      meta?: ApiMeta;
    };
