import { decodeIndexDefinitions, decodeMysqlPartitionConfig } from '@ddlbuilder/workspace-core';
import {
  createEntityId,
  normalizePersistedRows,
  type PersistedState,
} from '@ddlbuilder/shared-types';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { runIndexedDbRequest, runIndexedDbTransaction } from './indexedDbTransaction';
import { getWorkspaceScopeStorageKey } from './workspaceScope';
import { openDb, VERSION_STORE_NAME } from './workspaceDb';
import type { TableVersion } from './workspaceStorageTypes';
import { addWorkspaceEntityHistoryRecord } from './workspaceEntityDeletion';

export type TableVersionTarget = {
  scope: WorkspaceScope;
  tableId: string;
  normalizedName: string;
};

export const MAX_VERSIONS_PER_TABLE = 20;
export const INITIAL_VERSION_MESSAGE_KEY = 'initial_version';

export const getTableVersionKey = ({ scope, tableId }: TableVersionTarget) =>
  `${getWorkspaceScopeStorageKey(scope)}::${tableId}`;

const decodeVersion = (version: TableVersion): TableVersion => ({
  ...version,
  state: {
    ...normalizePersistedRows(version.state),
    indexes: decodeIndexDefinitions(version.state.indexes),
    ...(version.state.mysqlPartitionConfig
      ? { mysqlPartitionConfig: decodeMysqlPartitionConfig(version.state.mysqlPartitionConfig) }
      : {}),
  },
});

async function runWithStore<T>(
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return runIndexedDbRequest(db, VERSION_STORE_NAME, mode, runner);
}

const readVersions = async (target: TableVersionTarget): Promise<TableVersion[]> => {
  const versions = await runWithStore<TableVersion[]>('readonly', (store) =>
    store.index('tableKey').getAll(getTableVersionKey(target)),
  );
  return versions.sort((a, b) => b.createdAt - a.createdAt).map(decodeVersion);
};

export async function createVersion(
  target: TableVersionTarget,
  state: PersistedState,
  message?: string,
): Promise<TableVersion | null> {
  const version: TableVersion = {
    id: createEntityId(),
    tableKey: getTableVersionKey(target),
    tableId: target.tableId,
    tableNormalizedName: target.normalizedName,
    state,
    message,
    createdAt: Date.now(),
  };

  const saved = await addWorkspaceEntityHistoryRecord(target, VERSION_STORE_NAME, version);
  if (!saved) return null;
  await pruneOldVersions(target, MAX_VERSIONS_PER_TABLE);
  return version;
}

export async function listVersions(target: TableVersionTarget): Promise<TableVersion[]> {
  return readVersions(target);
}

export async function getVersion(
  id: string,
  target: TableVersionTarget,
): Promise<TableVersion | null> {
  const result = await runWithStore<TableVersion | undefined>('readonly', (store) => store.get(id));
  return result?.tableKey === getTableVersionKey(target) ? decodeVersion(result) : null;
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
