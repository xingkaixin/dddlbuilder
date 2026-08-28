import * as Y from 'yjs';
import type { IndexeddbPersistence } from 'y-indexeddb';
import { runIndexedDbTransaction } from '@/utils/indexedDbTransaction';

export const buildWorkspaceYDocName = (workspaceId: string) =>
  `ddlbuilder:workspace:${workspaceId}`;

export const LEGACY_MIGRATION_COMMITTED = 'legacy-migration-committed';
type WorkspaceYDocOwner = {
  dispose: () => Promise<void>;
  prepareSignOut: () => Promise<void>;
};
const activeOwners = new Map<string, Set<WorkspaceYDocOwner>>();

export const registerWorkspaceYDocOwner = (workspaceId: string, owner: WorkspaceYDocOwner) => {
  const owners = activeOwners.get(workspaceId) ?? new Set();
  owners.add(owner);
  activeOwners.set(workspaceId, owners);
  return () => {
    owners.delete(owner);
    if (owners.size === 0) activeOwners.delete(workspaceId);
  };
};

export const prepareWorkspaceSignOut = async (workspaceId: string) => {
  const owners = activeOwners.get(workspaceId);
  if (!owners?.size) throw new Error('Workspace is not ready');
  await Promise.all(Array.from(owners, (owner) => owner.prepareSignOut()));
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
  await Promise.all(Array.from(activeOwners.get(workspaceId) ?? [], (owner) => owner.dispose()));
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(buildWorkspaceYDocName(workspaceId));
    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to remove offline workspace'));
    request.onblocked = () =>
      reject(new Error('Close other workspace tabs to remove the offline copy'));
  });
};
