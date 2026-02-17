import type { PersistedState } from '@/types';
import type { SavedTableDraftRecord, WorkspaceSource } from '@/types/workspace';
import { STORAGE_KEY } from '@/utils/constants';
import {
  WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
  WORKSPACE_SAVED_DRAFTS_STORE_NAME,
  WORKSPACE_SESSION_STORE_NAME,
  openDb,
} from './savedTablesDb';

const GLOBAL_DRAFT_ROW_ID = 'global';
const WORKSPACE_SESSION_ROW_ID = 'active';

const GLOBAL_DRAFT_STORAGE_KEY = `${STORAGE_KEY}:draft:global:v1`;
const SAVED_TABLE_DRAFTS_STORAGE_KEY = `${STORAGE_KEY}:draft:saved:v1`;
const WORKSPACE_SESSION_STORAGE_KEY = `${STORAGE_KEY}:workspace:v1`;

type WorkspaceGlobalDraftEntity = {
  id: string;
  state: PersistedState;
  updatedAt: number;
};

type WorkspaceSavedDraftEntity = SavedTableDraftRecord & {
  normalizedName: string;
};

type WorkspaceSessionEntity = {
  id: string;
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
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB 请求失败'));
    tx.onerror = () => reject(tx.error ?? new Error('事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('事务被中止'));
    tx.oncomplete = () => {
      db.close();
    };
  });
};

export const readGlobalDraft =
  async (): Promise<WorkspaceGlobalDraftRecord | null> => {
    const entity = await runWithStore<WorkspaceGlobalDraftEntity | undefined>(
      WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
      'readonly',
      (store) => store.get(GLOBAL_DRAFT_ROW_ID),
    );
    if (!entity) return null;
    return {
      state: entity.state,
      updatedAt: entity.updatedAt,
    };
  };

export const writeGlobalDraft = async (
  record: WorkspaceGlobalDraftRecord,
): Promise<void> => {
  await runWithStore<IDBValidKey>(
    WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
    'readwrite',
    (store) =>
      store.put({
        id: GLOBAL_DRAFT_ROW_ID,
        ...record,
      } satisfies WorkspaceGlobalDraftEntity),
  );
};

export const clearGlobalDraft = async (): Promise<void> => {
  await runWithStore<undefined>(
    WORKSPACE_GLOBAL_DRAFT_STORE_NAME,
    'readwrite',
    (store) => store.delete(GLOBAL_DRAFT_ROW_ID),
  );
};

export const listSavedDrafts = async (): Promise<
  Record<string, SavedTableDraftRecord>
> => {
  const records = await runWithStore<WorkspaceSavedDraftEntity[]>(
    WORKSPACE_SAVED_DRAFTS_STORE_NAME,
    'readonly',
    (store) => store.getAll(),
  );
  if (!Array.isArray(records)) return {};
  const map: Record<string, SavedTableDraftRecord> = {};
  for (const record of records) {
    if (!record?.normalizedName) continue;
    map[record.normalizedName] = {
      state: record.state,
      tableName: record.tableName,
      baseSignature: record.baseSignature,
      updatedAt: record.updatedAt,
    };
  }
  return map;
};

export const readSavedDraft = async (
  normalizedName: string,
): Promise<SavedTableDraftRecord | null> => {
  const record = await runWithStore<WorkspaceSavedDraftEntity | undefined>(
    WORKSPACE_SAVED_DRAFTS_STORE_NAME,
    'readonly',
    (store) => store.get(normalizedName),
  );
  if (!record) return null;
  return {
    state: record.state,
    tableName: record.tableName,
    baseSignature: record.baseSignature,
    updatedAt: record.updatedAt,
  };
};

export const upsertSavedDraft = async (
  normalizedName: string,
  record: SavedTableDraftRecord,
): Promise<void> => {
  await runWithStore<IDBValidKey>(
    WORKSPACE_SAVED_DRAFTS_STORE_NAME,
    'readwrite',
    (store) =>
      store.put({
        normalizedName,
        ...record,
      } satisfies WorkspaceSavedDraftEntity),
  );
};

export const deleteSavedDraft = async (
  normalizedName: string,
): Promise<void> => {
  await runWithStore<undefined>(
    WORKSPACE_SAVED_DRAFTS_STORE_NAME,
    'readwrite',
    (store) => store.delete(normalizedName),
  );
};

export const renameSavedDraftKey = async (
  fromNormalizedName: string,
  toNormalizedName: string,
  nextTableName: string,
): Promise<void> => {
  const record = await readSavedDraft(fromNormalizedName);
  if (!record) return;

  await upsertSavedDraft(toNormalizedName, {
    ...record,
    tableName: nextTableName,
    updatedAt: Date.now(),
  });

  if (fromNormalizedName !== toNormalizedName) {
    await deleteSavedDraft(fromNormalizedName);
  }
};

export const readWorkspaceSession =
  async (): Promise<WorkspaceSessionRecord | null> => {
    const entity = await runWithStore<WorkspaceSessionEntity | undefined>(
      WORKSPACE_SESSION_STORE_NAME,
      'readonly',
      (store) => store.get(WORKSPACE_SESSION_ROW_ID),
    );
    if (!entity) return null;
    return {
      activeSource: entity.activeSource,
      activeState: entity.activeState,
      updatedAt: entity.updatedAt,
    };
  };

export const writeWorkspaceSession = async (
  record: WorkspaceSessionRecord,
): Promise<void> => {
  await runWithStore<IDBValidKey>(
    WORKSPACE_SESSION_STORE_NAME,
    'readwrite',
    (store) =>
      store.put({
        id: WORKSPACE_SESSION_ROW_ID,
        ...record,
      } satisfies WorkspaceSessionEntity),
  );
};

export const clearWorkspaceSession = async (): Promise<void> => {
  await runWithStore<undefined>(
    WORKSPACE_SESSION_STORE_NAME,
    'readwrite',
    (store) => store.delete(WORKSPACE_SESSION_ROW_ID),
  );
};

const readLegacyGlobalDraftRecord = (): WorkspaceGlobalDraftRecord | null => {
  const parsed = parseStorageJson<unknown>(GLOBAL_DRAFT_STORAGE_KEY);
  if (
    isRecord(parsed) &&
    parsed.state &&
    typeof parsed.updatedAt === 'number'
  ) {
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
    const updatedAt =
      typeof value.updatedAt === 'number' ? value.updatedAt : Date.now();
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
    updatedAt:
      typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
  };
};

let migrationPromise: Promise<void> | null = null;

export const migrateLegacyWorkspaceFromLocalStorage =
  async (): Promise<void> => {
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
          await writeGlobalDraft(globalDraftRecord);
        }

        for (const [normalizedName, draft] of Object.entries(savedDraftMap)) {
          await upsertSavedDraft(normalizedName, draft);
        }

        if (workspaceSession) {
          await writeWorkspaceSession(workspaceSession);
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
