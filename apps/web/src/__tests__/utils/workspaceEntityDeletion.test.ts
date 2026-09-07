import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import * as Y from 'yjs';
import {
  beginWorkspaceEntityDeletion,
  commitWorkspaceEntityWrites,
  createWorkspaceEntityDeletionMarker,
  getWorkspaceEntityDeletionMarkerId,
} from '@/utils/workspaceEntityDeletion';
import { openDb, WORKSPACE_ENTITY_META_STORE_NAME } from '@/utils/workspaceDb';
import { runIndexedDbRequest } from '@/utils/indexedDbTransaction';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';

const target = {
  scope: { kind: 'anonymous' as const },
  tableId: 'table-1',
  normalizedName: 'users',
};

const readMarker = async () =>
  runIndexedDbRequest(await openDb(), WORKSPACE_ENTITY_META_STORE_NAME, 'readonly', (store) =>
    store.get(getWorkspaceEntityDeletionMarkerId(target)),
  );

beforeEach(() => setupFakeIndexedDB());
afterEach(() => teardownFakeIndexedDB());

describe('workspace entity commits', () => {
  it.each(['activate', 'delete'] as const)(
    'leaves Y.Doc unchanged when the %s marker transaction aborts after request success',
    async (operation) => {
      const marker = createWorkspaceEntityDeletionMarker(target, 'deleted');
      if (operation === 'activate') {
        await runIndexedDbRequest(
          await openDb(),
          WORKSPACE_ENTITY_META_STORE_NAME,
          'readwrite',
          (store) => store.put(marker),
        );
      }
      const doc = new Y.Doc();
      doc.getMap('tables').set('table-1', 'original');
      const mutate = vi.fn(() => doc.getMap('tables').set('table-1', 'changed'));
      if (operation === 'activate') {
        const remove = IDBObjectStore.prototype.delete;
        vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(
          function (this: IDBObjectStore, key) {
            const request = remove.call(this, key);
            request.addEventListener('success', () => this.transaction.abort());
            return request;
          },
        );
      } else {
        const put = IDBObjectStore.prototype.put;
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(
          function (this: IDBObjectStore, value, key) {
            const request = put.call(this, value, key);
            request.addEventListener('success', () => this.transaction.abort());
            return request;
          },
        );
      }
      const completion =
        operation === 'activate'
          ? commitWorkspaceEntityWrites([{ target, mode: 'activate' }], mutate)
          : beginWorkspaceEntityDeletion(target, mutate);
      await expect(completion).rejects.toThrow('IndexedDB 事务被中止');
      expect(mutate).not.toHaveBeenCalled();
      expect(doc.getMap('tables').get('table-1')).toBe('original');
      vi.restoreAllMocks();
      expect(await readMarker()).toEqual(operation === 'activate' ? marker : undefined);
      doc.destroy();
    },
  );

  it('allows updates after reactivation commits', async () => {
    await runIndexedDbRequest(
      await openDb(),
      WORKSPACE_ENTITY_META_STORE_NAME,
      'readwrite',
      (store) => store.put(createWorkspaceEntityDeletionMarker(target, 'deleted')),
    );
    const doc = new Y.Doc();
    await commitWorkspaceEntityWrites([{ target, mode: 'activate' }], () =>
      doc.getMap('tables').set('table-1', 'restored'),
    );
    expect(await readMarker()).toBeUndefined();
    await commitWorkspaceEntityWrites([{ target, mode: 'update' }], () =>
      doc.getMap('tables').set('table-1', 'updated'),
    );
    expect(doc.getMap('tables').get('table-1')).toBe('updated');
    doc.destroy();
  });
});
