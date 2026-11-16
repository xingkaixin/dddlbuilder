import { useMemo, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import {
  subscribeWorkspaceYDoc,
  type WorkspaceYDocCollection,
  type WorkspaceYDocChange,
} from '@/services/workspaceYDocAdapter';

function createProjectionStore<T>(
  doc: Y.Doc,
  collections: readonly WorkspaceYDocCollection[],
  read: (doc: Y.Doc, previous?: T, change?: WorkspaceYDocChange) => T,
) {
  let snapshot = read(doc);

  return {
    getSnapshot: () => snapshot,
    subscribe: (notify: () => void) => {
      const unsubscribe = subscribeWorkspaceYDoc(
        doc,
        (change) => {
          snapshot = read(doc, snapshot, change);
          notify();
        },
        collections,
      );
      // Capture changes made between render and subscription setup.
      snapshot = read(doc);

      return unsubscribe;
    },
  };
}

export function useWorkspaceYDocProjection<T>(
  doc: Y.Doc | null,
  collections: readonly WorkspaceYDocCollection[],
  read: (doc: Y.Doc, previous?: T, change?: WorkspaceYDocChange) => T,
  empty: T,
): T {
  const store = useMemo(
    () =>
      doc
        ? createProjectionStore(doc, collections, read)
        : { getSnapshot: () => empty, subscribe: () => () => {} },
    [collections, doc, empty, read],
  );

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
