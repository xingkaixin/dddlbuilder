import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import type { IndexeddbPersistence } from 'y-indexeddb';
import {
  clearWorkspaceYDocData,
  commitLegacyWorkspaceYDoc,
  LEGACY_MIGRATION_COMMITTED,
  registerWorkspaceYDocOwner,
  prepareWorkspaceSignOut,
} from '@/services/workspaceYDocStorage';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('workspace offline storage lifecycle', () => {
  it('closes active owners before awaiting deletion of only the selected database', async () => {
    const dispose = vi.fn().mockResolvedValue(undefined);
    const otherDispose = vi.fn().mockResolvedValue(undefined);
    const unregister = registerWorkspaceYDocOwner('selected', { dispose, prepareSignOut: vi.fn() });
    const unregisterOther = registerWorkspaceYDocOwner('other', {
      dispose: otherDispose,
      prepareSignOut: vi.fn(),
    });
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

  it('requires every active owner to confirm sync before sign out', async () => {
    const dispose = vi.fn();
    const confirmed = vi.fn().mockResolvedValue(undefined);
    const unconfirmed = vi.fn().mockRejectedValue(new Error('Sync unavailable'));
    const unregister = registerWorkspaceYDocOwner('selected', {
      dispose,
      prepareSignOut: confirmed,
    });
    const unregisterPending = registerWorkspaceYDocOwner('selected', {
      dispose,
      prepareSignOut: unconfirmed,
    });
    await expect(prepareWorkspaceSignOut('selected')).rejects.toThrow('Sync unavailable');
    expect(confirmed).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();
    unregisterPending();
    await expect(prepareWorkspaceSignOut('selected')).resolves.toBeUndefined();
    unregister();
    await expect(prepareWorkspaceSignOut('selected')).rejects.toThrow('Workspace is not ready');
  });

  it('cancels sign out when local persistence stops responding', async () => {
    vi.useFakeTimers();
    const dispose = vi.fn();
    const unregister = registerWorkspaceYDocOwner('stalled', {
      dispose,
      prepareSignOut: () => new Promise<void>(() => {}),
    });
    let outcome = 'waiting';
    void prepareWorkspaceSignOut('stalled').then(
      () => {
        outcome = 'confirmed';
      },
      () => {
        outcome = 'cancelled';
      },
    );
    await vi.advanceTimersByTimeAsync(10_000);
    unregister();
    expect(outcome).toBe('cancelled');
    expect(dispose).not.toHaveBeenCalled();
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
