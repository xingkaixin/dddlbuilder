import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { IndexeddbPersistence } from 'y-indexeddb';
import {
  clearWorkspaceYDocData,
  commitLegacyWorkspaceYDoc,
  LEGACY_MIGRATION_COMMITTED,
  registerWorkspaceYDocDisposer,
} from '@/services/workspaceYDocStorage';

afterEach(() => vi.unstubAllGlobals());

describe('workspace offline storage lifecycle', () => {
  it('closes active owners before awaiting deletion of only the selected database', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    const otherDispose = vi.fn().mockResolvedValue(undefined);
    const unregister = registerWorkspaceYDocDisposer('selected', dispose);
    const unregisterOther = registerWorkspaceYDocDisposer('other', otherDispose);
    const request = { onsuccess: null as (() => void) | null };
    const deleteDatabase = vi.fn(() => request);
    vi.stubGlobal('indexedDB', { deleteDatabase });
    let completed = false;
    const cleanup = clearWorkspaceYDocData('selected').then(() => {
      completed = true;
    });
    await vi.waitFor(() =>
      expect(deleteDatabase).toHaveBeenCalledWith('ddlbuilder:workspace:selected'),
    );
    expect(dispose).toHaveBeenCalledOnce();
    expect(otherDispose).not.toHaveBeenCalled();
    expect(completed).toBe(false);
    request.onsuccess?.();
    await cleanup;
    expect(completed).toBe(true);
    unregister();
    unregisterOther();
  });

  it.each(['complete', 'abort'])(
    'commits migration data and marker atomically: %s',
    async (event) => {
      const store = { add: vi.fn(), put: vi.fn() };
      const tx = {
        objectStore: vi.fn(() => store),
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        abort: vi.fn(),
      };
      const db = { transaction: vi.fn(() => tx), close: vi.fn() };
      const doc = new Y.Doc();
      doc.getMap('drafts').set('sample', 'content');
      let completed = false;
      const result = commitLegacyWorkspaceYDoc({ db } as unknown as IndexeddbPersistence, doc).then(
        () => {
          completed = true;
          return 'complete';
        },
        () => 'abort',
      );
      expect(db.transaction).toHaveBeenCalledWith(['updates', 'custom'], 'readwrite');
      expect(store.put).toHaveBeenCalledWith(true, LEGACY_MIGRATION_COMMITTED);
      const recovered = new Y.Doc();
      Y.applyUpdate(recovered, store.add.mock.calls[0][0]);
      expect(recovered.getMap('drafts').get('sample')).toBe('content');
      await Promise.resolve();
      expect(completed).toBe(false);
      if (event === 'complete') tx.oncomplete?.();
      else tx.onabort?.();
      expect(await result).toBe(event);
      expect(db.close).not.toHaveBeenCalled();
      doc.destroy();
      recovered.destroy();
    },
  );
});
