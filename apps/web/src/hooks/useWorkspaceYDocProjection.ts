import { useMemo, useSyncExternalStore } from 'react';
import type * as Y from 'yjs';
import {
  subscribeWorkspaceYDoc,
  type WorkspaceYDocCollection,
} from '@/services/workspaceYDocAdapter';

export function useWorkspaceYDocProjection<T>(
  doc: Y.Doc | null,
  collections: readonly WorkspaceYDocCollection[],
  read: (doc: Y.Doc) => T,
  empty: T,
): T {
  const store = useMemo(() => {
    if (!doc) {
      return {
        getSnapshot: () => empty,
        subscribe: () => () => {},
      };
    }

    let snapshot = read(doc);
    return {
      getSnapshot: () => snapshot,
      subscribe: (notify: () => void) => {
        const unsubscribe = subscribeWorkspaceYDoc(
          doc,
          () => {
            snapshot = read(doc);
            notify();
          },
          collections,
        );
        // Capture changes made between render and subscription setup.
        snapshot = read(doc);
        return unsubscribe;
      },
    };
  }, [collections, doc, empty, read]);

  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
