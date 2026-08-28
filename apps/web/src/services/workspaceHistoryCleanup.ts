import type * as Y from 'yjs';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { runIndexedDbTransaction } from '@/utils/indexedDbTransaction';
import { openDb, VERSION_STORE_NAME, REVIEW_STORE_NAME } from '@/utils/workspaceDb';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';
import {
  listSavedTableMetadataFromYDoc,
  listTrashedSavedTableMetadataFromYDoc,
  subscribeWorkspaceYDoc,
} from './workspaceYDocAdapter';

const HISTORY_STORES = [VERSION_STORE_NAME, REVIEW_STORE_NAME];

const deleteHistory = async (scope: WorkspaceScope, keepTableIds?: () => Set<string>) => {
  const db = await openDb();
  const prefix = `${getWorkspaceScopeStorageKey(scope)}::`;
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  const tableIds = keepTableIds?.();
  await runIndexedDbTransaction(db, HISTORY_STORES, 'readwrite', (tx, fail) => {
    for (const name of HISTORY_STORES) {
      const store = tx.objectStore(name);
      const request = store.index('tableKey').openKeyCursor(range);
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (typeof cursor.key !== 'string') {
          cursor.continue();
          return;
        }
        const key = cursor.key.slice(prefix.length);
        const tableId =
          name === VERSION_STORE_NAME ? key : key.startsWith('table:') ? key.slice(6) : null;
        if (!tableIds || (tableId !== null && !tableIds.has(tableId)))
          store.delete(cursor.primaryKey);
        cursor.continue();
      };
    }
    return () => undefined;
  });
};

export const clearWorkspaceHistory = (scope: WorkspaceScope) => deleteHistory(scope);

export const watchWorkspaceHistory = (doc: Y.Doc, scope: WorkspaceScope) => {
  const readIds = () =>
    new Set(
      [
        ...listSavedTableMetadataFromYDoc(doc),
        ...listTrashedSavedTableMetadataFromYDoc(doc),
      ].flatMap((table) => (table.tableId ? [table.tableId] : [])),
    );
  let previousIds = readIds();
  const cleanup = () => {
    void deleteHistory(scope, readIds).catch((error: unknown) =>
      console.error('[workspace] history cleanup failed', error),
    );
  };
  cleanup();
  return subscribeWorkspaceYDoc(doc, () => {
    const current = readIds();
    if ([...previousIds].some((id) => !current.has(id))) cleanup();
    previousIds = current;
  }, ['savedTables']);
};
