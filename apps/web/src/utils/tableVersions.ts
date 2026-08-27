import {
  createEntityId,
  normalizePersistedRows,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { runIndexedDbRequest, runIndexedDbTransaction } from './indexedDbTransaction';
import { getWorkspaceScopeStorageKey } from './workspaceScope';
import { openDb, VERSION_STORE_NAME } from './workspaceDb';
import type { TableVersion, TableVersionMetadata } from './workspaceStorageTypes';

export type TableVersionTarget = {
  scope: WorkspaceScope;
  tableId: string;
  normalizedName: string;
};

export const MAX_VERSIONS_PER_TABLE = 20;
export const INITIAL_VERSION_MESSAGE_KEY = 'initial_version';

const getTableKey = ({ scope, tableId }: TableVersionTarget) =>
  `${getWorkspaceScopeStorageKey(scope)}::${tableId}`;

const decodeVersion = (version: TableVersion): TableVersion => ({
  ...version,
  state: normalizePersistedRows(version.state),
});

async function runWithStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return runIndexedDbRequest(db, VERSION_STORE_NAME, mode, runner);
}

const readAndClaimVersions = async (target: TableVersionTarget): Promise<TableVersion[]> => {
  const db = await openDb();
  const tableKey = getTableKey(target);
  return runIndexedDbTransaction(db, VERSION_STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(VERSION_STORE_NAME);
    const scopedRequest = store.index('tableKey').getAll(tableKey);
    const sameNameRequest = store.index('tableNormalizedName').getAll(target.normalizedName);
    let scopedVersions: TableVersion[] | null = null;
    let sameNameVersions: TableVersion[] | null = null;
    let versions: TableVersion[] = [];

    const claimLegacyVersions = () => {
      if (!scopedVersions || !sameNameVersions) return;
      const claimed = sameNameVersions
        .filter((version) => !version.tableKey)
        .map((version) => ({
          ...version,
          tableKey,
          tableId: target.tableId,
        }));
      for (const version of claimed) store.put(version);
      versions = [...scopedVersions, ...claimed];
    };

    scopedRequest.onsuccess = () => {
      scopedVersions = scopedRequest.result as TableVersion[];
      claimLegacyVersions();
    };
    sameNameRequest.onsuccess = () => {
      sameNameVersions = sameNameRequest.result as TableVersion[];
      claimLegacyVersions();
    };
    return () => versions.sort((a, b) => b.createdAt - a.createdAt).map(decodeVersion);
  });
};

export async function createVersion(
  target: TableVersionTarget,
  state: PersistedState,
  message?: string,
): Promise<TableVersion> {
  const version: TableVersion = {
    id: createEntityId(),
    tableKey: getTableKey(target),
    tableId: target.tableId,
    tableNormalizedName: target.normalizedName,
    state,
    message,
    createdAt: Date.now(),
  };

  await runWithStore<IDBValidKey>('readwrite', (store) => store.add(version));
  await pruneOldVersions(target, MAX_VERSIONS_PER_TABLE);
  return version;
}

export async function listVersions(target: TableVersionTarget): Promise<TableVersion[]> {
  return readAndClaimVersions(target);
}

export async function listVersionMetadata(
  target: TableVersionTarget,
): Promise<TableVersionMetadata[]> {
  const versions = await listVersions(target);
  return versions.map((version) => ({
    id: version.id,
    tableNormalizedName: version.tableNormalizedName,
    message: version.message,
    dbType: version.state.dbType,
    fieldCount: version.state.rows?.filter((row) => row.fieldName?.trim()).length || 0,
    createdAt: version.createdAt,
  }));
}

export async function getVersion(
  id: string,
  target: TableVersionTarget,
): Promise<TableVersion | null> {
  const result = await runWithStore<TableVersion | undefined>('readonly', (store) => store.get(id));
  if (!result) return null;
  if (result.tableKey === getTableKey(target)) return decodeVersion(result);
  if (result.tableKey || result.tableNormalizedName !== target.normalizedName) return null;
  return (await listVersions(target)).find((version) => version.id === id) ?? null;
}

export async function deleteVersion(id: string, target: TableVersionTarget): Promise<void> {
  if (!(await getVersion(id, target))) return;
  await runWithStore<undefined>('readwrite', (store) => store.delete(id));
}

const deleteVersions = async (versions: TableVersion[]): Promise<void> => {
  if (versions.length === 0) return;
  const db = await openDb();
  await runIndexedDbTransaction(db, VERSION_STORE_NAME, 'readwrite', (tx) => {
    const store = tx.objectStore(VERSION_STORE_NAME);
    for (const version of versions) store.delete(version.id);
    return () => undefined;
  });
};

export async function deleteAllVersions(target: TableVersionTarget): Promise<void> {
  await deleteVersions(await listVersions(target));
}

export async function pruneOldVersions(
  target: TableVersionTarget,
  maxCount: number,
): Promise<number> {
  const versions = await listVersions(target);
  const toDelete = versions.slice(Math.max(0, maxCount));
  await deleteVersions(toDelete);
  return toDelete.length;
}

export async function countVersions(target: TableVersionTarget): Promise<number> {
  return (await listVersions(target)).length;
}
