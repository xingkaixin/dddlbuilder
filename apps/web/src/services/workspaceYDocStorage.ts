import * as Y from 'yjs';
import type { IndexeddbPersistence } from 'y-indexeddb';
import { runIndexedDbTransaction } from '@/utils/indexedDbTransaction';

export const buildWorkspaceYDocName = (workspaceId: string) =>
  `ddlbuilder:workspace:${workspaceId}`;

export const LEGACY_MIGRATION_COMMITTED = 'legacy-migration-committed';
const activeDisposers = new Map<string, Set<() => Promise<void>>>();

export const registerWorkspaceYDocDisposer = (
  workspaceId: string,
  dispose: () => Promise<void>,
) => {
  const disposers = activeDisposers.get(workspaceId) ?? new Set();
  disposers.add(dispose);
  activeDisposers.set(workspaceId, disposers);
  return () => {
    disposers.delete(dispose);
    if (disposers.size === 0) activeDisposers.delete(workspaceId);
  };
};

export const commitLegacyWorkspaceYDoc = async (persistence: IndexeddbPersistence, doc: Y.Doc) => {
  if (!persistence.db) throw new Error('Workspace database is not open');
  await runIndexedDbTransaction(
    persistence.db,
    ['updates', 'custom'],
    'readwrite',
    (tx) => {
      tx.objectStore('updates').add(Y.encodeStateAsUpdate(doc));
      tx.objectStore('custom').put(true, LEGACY_MIGRATION_COMMITTED);
      return () => undefined;
    },
    { closeDatabase: false },
  );
};

export const clearWorkspaceYDocData = async (workspaceId: string) => {
  await Promise.all(Array.from(activeDisposers.get(workspaceId) ?? [], (dispose) => dispose()));
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(buildWorkspaceYDocName(workspaceId));
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to remove offline workspace'));
    request.onblocked = () =>
      reject(new Error('Close other workspace tabs to remove the offline copy'));
  });
};
