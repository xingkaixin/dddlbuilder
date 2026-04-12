import type { PersistedState } from '@/types';
import type { SavedTableDraftRecord, WorkspaceScope, WorkspaceSource } from '@/types/workspace';
import { STORAGE_KEY } from '@/utils/constants';
import {
  STORE_NAME,
  WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
  WORKSPACE_SAVED_DRAFTS_STORE_NAME,
  WORKSPACE_SESSION_STORE_NAME,
  openDb,
  type SavedTableRecord,
} from './savedTablesDb';
import {
  buildScopedWorkspaceKey,
  getAnonymousWorkspaceScope,
  getCurrentWorkspaceScope,
  getWorkspaceScopeStorageKey,
} from './workspaceScope';

const GLOBAL_DRAFT_ROW_ID = 'global';
const WORKSPACE_SESSION_ROW_ID = 'active';

const GLOBAL_DRAFT_STORAGE_KEY = `${STORAGE_KEY}:draft:global:v1`;
const SAVED_TABLE_DRAFTS_STORAGE_KEY = `${STORAGE_KEY}:draft:saved:v1`;
const WORKSPACE_SESSION_STORAGE_KEY = `${STORAGE_KEY}:workspace:v1`;

type WorkspaceGlobalDraftEntity = {
  id: string;
  scope?: string;
  state: PersistedState;
  updatedAt: number;
};

type WorkspaceSavedDraftEntity = SavedTableDraftRecord & {
  normalizedName: string;
  scope?: string;
};

type WorkspaceSessionEntity = {
  id: string;
  scope?: string;
  activeSource: WorkspaceSource;
  activeState: PersistedState | null;
  updatedAt: number;
};

export type WorkspaceGlobalDraftRecord = Omit<WorkspaceGlobalDraftEntity, 'id'>;

export type WorkspaceSessionRecord = Omit<WorkspaceSessionEntity, 'id'>;

type WorkspaceStoreName =
  | typeof WORKSPACE_GLOBAL_DRAFT_STORE_NAME
  | typeof WORKSPACE_SAVED_DRAFTS_STORE_NAME
  | typeof WORKSPACE_SESSION_STORE_NAME;

type BootstrapReadableStoreName = WorkspaceStoreName | typeof STORE_NAME;

const LEGACY_SCOPE = getWorkspaceScopeStorageKey(getAnonymousWorkspaceScope());

const withScopeKey = (scope: WorkspaceScope, key: string) => buildScopedWorkspaceKey(scope, key);

const decodeScopedEntity = <T extends { id?: string; normalizedName?: string; scope?: string }>(
  entity: T,
  scope: WorkspaceScope,
): T | null => {
  const scopeKey = getWorkspaceScopeStorageKey(scope);

  const rawKey = typeof entity.id === 'string' ? entity.id : entity.normalizedName;
  if (!rawKey) {
    return null;
  }

  if (entity.scope && entity.scope !== scopeKey) {
    return null;
  }

  if (rawKey.includes('::')) {
    const prefix = `${scopeKey}::`;
    if (!rawKey.startsWith(prefix)) {
      return null;
    }

    if (typeof entity.id === 'string') {
      return {
        ...entity,
        id: rawKey.slice(prefix.length),
        scope: scopeKey,
      };
    }
    return {
      ...entity,
      normalizedName: rawKey.slice(prefix.length),
      scope: scopeKey,
    };
  }

  if (scope.kind !== 'anonymous') {
    return null;
  }

  return {
    ...entity,
    scope: LEGACY_SCOPE,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseStorageJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const removeStorage = (key: string) => {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore localStorage errors
  }
};

const runWithStore = async <T>(
  storeName: WorkspaceStoreName,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = runner(store);

    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
    };
  });
};

export const readGlobalDraft = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<WorkspaceGlobalDraftRecord | null> => {
  const entity = await runWithStore<WorkspaceGlobalDraftEntity | undefined>(
    WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
    'readonly',
    (store) => store.get(withScopeKey(scope, GLOBAL_DRAFT_ROW_ID)),
  );
  if (!entity) return null;
  const decoded = decodeScopedEntity(entity, scope);
  if (!decoded) return null;
  return {
    state: decoded.state,
    updatedAt: decoded.updatedAt,
  };
};

export const writeGlobalDraft = async (
  record: WorkspaceGlobalDraftRecord,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<IDBValidKey>(WORKSPACE_GLOBAL_DRAFT_STORE_NAME, 'readwrite', (store) =>
    store.put({
      id: withScopeKey(scope, GLOBAL_DRAFT_ROW_ID),
      scope: getWorkspaceScopeStorageKey(scope),
      ...record,
    } satisfies WorkspaceGlobalDraftEntity),
  );
};

export const clearGlobalDraft = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<undefined>(WORKSPACE_GLOBAL_DRAFT_STORE_NAME, 'readwrite', (store) =>
    store.delete(withScopeKey(scope, GLOBAL_DRAFT_ROW_ID)),
  );
};

export const listSavedDrafts = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<Record<string, SavedTableDraftRecord>> => {
  const records = await runWithStore<WorkspaceSavedDraftEntity[]>(
    WORKSPACE_SAVED_DRAFTS_STORE_NAME,
    'readonly',
    (store) => store.getAll(),
  );
  if (!Array.isArray(records)) return {};
  const map: Record<string, SavedTableDraftRecord> = {};
  for (const record of records) {
    const decoded = decodeScopedEntity(record, scope);
    if (!decoded?.normalizedName) continue;
    map[decoded.normalizedName] = {
      state: decoded.state,
      tableName: decoded.tableName,
      baseSignature: decoded.baseSignature,
      updatedAt: decoded.updatedAt,
    };
  }
  return map;
};

export const readSavedDraft = async (
  normalizedName: string,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<SavedTableDraftRecord | null> => {
  const record = await runWithStore<WorkspaceSavedDraftEntity | undefined>(
    WORKSPACE_SAVED_DRAFTS_STORE_NAME,
    'readonly',
    (store) => store.get(withScopeKey(scope, normalizedName)),
  );
  if (!record) return null;
  const decoded = decodeScopedEntity(record, scope);
  if (!decoded) return null;
  return {
    state: decoded.state,
    tableName: decoded.tableName,
    baseSignature: decoded.baseSignature,
    updatedAt: decoded.updatedAt,
  };
};

export const upsertSavedDraft = async (
  normalizedName: string,
  record: SavedTableDraftRecord,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<IDBValidKey>(WORKSPACE_SAVED_DRAFTS_STORE_NAME, 'readwrite', (store) =>
    store.put({
      normalizedName: withScopeKey(scope, normalizedName),
      scope: getWorkspaceScopeStorageKey(scope),
      ...record,
    } satisfies WorkspaceSavedDraftEntity),
  );
};

export const deleteSavedDraft = async (
  normalizedName: string,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<undefined>(WORKSPACE_SAVED_DRAFTS_STORE_NAME, 'readwrite', (store) =>
    store.delete(withScopeKey(scope, normalizedName)),
  );
};

export const renameSavedDraftKey = async (
  fromNormalizedName: string,
  toNormalizedName: string,
  nextTableName: string,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  const record = await readSavedDraft(fromNormalizedName, scope);
  if (!record) return;

  await upsertSavedDraft(
    toNormalizedName,
    {
      ...record,
      tableName: nextTableName,
      updatedAt: Date.now(),
    },
    scope,
  );

  if (fromNormalizedName !== toNormalizedName) {
    await deleteSavedDraft(fromNormalizedName, scope);
  }
};

export const readWorkspaceSession = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<WorkspaceSessionRecord | null> => {
  const entity = await runWithStore<WorkspaceSessionEntity | undefined>(
    WORKSPACE_SESSION_STORE_NAME,
    'readonly',
    (store) => store.get(withScopeKey(scope, WORKSPACE_SESSION_ROW_ID)),
  );
  if (!entity) return null;
  const decoded = decodeScopedEntity(entity, scope);
  if (!decoded) return null;
  return {
    activeSource: decoded.activeSource,
    activeState: decoded.activeState,
    updatedAt: decoded.updatedAt,
  };
};

export const readWorkspaceBootstrap = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<{
  globalDraft: WorkspaceGlobalDraftRecord | null;
  session: WorkspaceSessionRecord | null;
  savedTable: SavedTableRecord | null;
}> => {
  const db = await openDb();
  const readEntity = <T>(
    storeName: BootstrapReadableStoreName,
    key: string,
  ): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result as T | undefined);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB 请求失败'));
      tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
      tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    });

  try {
    const [globalEntity, sessionEntity] = await Promise.all([
      readEntity<WorkspaceGlobalDraftEntity>(
        WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
        withScopeKey(scope, GLOBAL_DRAFT_ROW_ID),
      ),
      readEntity<WorkspaceSessionEntity>(
        WORKSPACE_SESSION_STORE_NAME,
        withScopeKey(scope, WORKSPACE_SESSION_ROW_ID),
      ),
    ]);
    const savedTableEntity =
      sessionEntity?.activeSource.kind === 'saved_table'
        ? await readEntity<SavedTableRecord>(
            STORE_NAME,
            withScopeKey(scope, sessionEntity.activeSource.normalizedName),
          )
        : undefined;
    const decodedGlobal = globalEntity ? decodeScopedEntity(globalEntity, scope) : null;
    const decodedSession = sessionEntity ? decodeScopedEntity(sessionEntity, scope) : null;

    return {
      globalDraft: decodedGlobal
        ? {
            state: decodedGlobal.state,
            updatedAt: decodedGlobal.updatedAt,
          }
        : null,
      session: decodedSession
        ? {
            activeSource: decodedSession.activeSource,
            activeState: decodedSession.activeState,
            updatedAt: decodedSession.updatedAt,
          }
        : null,
      savedTable: savedTableEntity ? decodeScopedEntity(savedTableEntity, scope) : null,
    };
  } finally {
    db.close();
  }
};

export const writeWorkspaceSession = async (
  record: WorkspaceSessionRecord,
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<IDBValidKey>(WORKSPACE_SESSION_STORE_NAME, 'readwrite', (store) =>
    store.put({
      id: withScopeKey(scope, WORKSPACE_SESSION_ROW_ID),
      scope: getWorkspaceScopeStorageKey(scope),
      ...record,
    } satisfies WorkspaceSessionEntity),
  );
};

export const clearWorkspaceSession = async (
  scope: WorkspaceScope = getCurrentWorkspaceScope(),
): Promise<void> => {
  await runWithStore<undefined>(WORKSPACE_SESSION_STORE_NAME, 'readwrite', (store) =>
    store.delete(withScopeKey(scope, WORKSPACE_SESSION_ROW_ID)),
  );
};

const readLegacyGlobalDraftRecord = (): WorkspaceGlobalDraftRecord | null => {
  const parsed = parseStorageJson<unknown>(GLOBAL_DRAFT_STORAGE_KEY);
  if (isRecord(parsed) && parsed.state && typeof parsed.updatedAt === 'number') {
    return {
      state: parsed.state as PersistedState,
      updatedAt: parsed.updatedAt,
    };
  }

  if (isRecord(parsed)) {
    return {
      state: parsed as PersistedState,
      updatedAt: Date.now(),
    };
  }

  const legacy = parseStorageJson<unknown>(STORAGE_KEY);
  if (!isRecord(legacy)) return null;
  return {
    state: legacy as PersistedState,
    updatedAt: Date.now(),
  };
};

const readLegacySavedDraftMap = (): Record<string, SavedTableDraftRecord> => {
  const parsed = parseStorageJson<unknown>(SAVED_TABLE_DRAFTS_STORAGE_KEY);
  if (!isRecord(parsed)) return {};

  const next: Record<string, SavedTableDraftRecord> = {};
  for (const [normalizedName, value] of Object.entries(parsed)) {
    if (!isRecord(value)) continue;
    if (typeof value.tableName !== 'string') continue;
    if (typeof value.baseSignature !== 'string') continue;
    const updatedAt = typeof value.updatedAt === 'number' ? value.updatedAt : Date.now();
    next[normalizedName] = {
      state: value.state as PersistedState,
      tableName: value.tableName,
      baseSignature: value.baseSignature,
      updatedAt,
    };
  }
  return next;
};

const readLegacyWorkspaceSession = (): WorkspaceSessionRecord | null => {
  const parsed = parseStorageJson<unknown>(WORKSPACE_SESSION_STORAGE_KEY);
  if (!isRecord(parsed) || !parsed.activeSource) return null;

  return {
    activeSource: parsed.activeSource as WorkspaceSource,
    activeState: (parsed.activeState as PersistedState | null) ?? null,
    updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
  };
};

let migrationPromise: Promise<void> | null = null;

export const migrateLegacyWorkspaceFromLocalStorage = async (): Promise<void> => {
  if (migrationPromise) {
    await migrationPromise;
    return;
  }

  migrationPromise = (async () => {
    const globalDraftRecord = readLegacyGlobalDraftRecord();
    const savedDraftMap = readLegacySavedDraftMap();
    const workspaceSession = readLegacyWorkspaceSession();
    const hasLegacyData =
      Boolean(globalDraftRecord) ||
      Object.keys(savedDraftMap).length > 0 ||
      Boolean(workspaceSession);

    if (!hasLegacyData) return;

    try {
      if (globalDraftRecord) {
        await writeGlobalDraft(globalDraftRecord, getAnonymousWorkspaceScope());
      }

      for (const [normalizedName, draft] of Object.entries(savedDraftMap)) {
        await upsertSavedDraft(normalizedName, draft, getAnonymousWorkspaceScope());
      }

      if (workspaceSession) {
        await writeWorkspaceSession(workspaceSession, getAnonymousWorkspaceScope());
      }

      removeStorage(GLOBAL_DRAFT_STORAGE_KEY);
      removeStorage(SAVED_TABLE_DRAFTS_STORAGE_KEY);
      removeStorage(WORKSPACE_SESSION_STORAGE_KEY);
      removeStorage(STORAGE_KEY);
    } catch {
      // keep legacy data for retry when migration fails
    }
  })();

  try {
    await migrationPromise;
  } finally {
    migrationPromise = null;
  }
};
