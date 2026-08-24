import { useCallback, useMemo } from 'react';
import type * as Y from 'yjs';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import type { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';

interface WorkspaceReadOperations<T> {
  yDoc: (doc: Y.Doc) => T;
  local: (scope: WorkspaceScope) => Promise<T>;
}

interface WorkspaceWriteOperations {
  yDoc: (doc: Y.Doc) => void;
  local: (scope: WorkspaceScope) => Promise<void>;
}

interface WorkspaceUpdateOperations<T> {
  yDoc: (doc: Y.Doc) => T;
  local: (scope: WorkspaceScope) => Promise<T>;
}

interface UseWorkspaceStorageTargetParams {
  scope: WorkspaceScope | null;
  yDoc: Y.Doc | null;
  runInYDoc: ReturnType<typeof useWorkspaceYDocGateway>['runInYDoc'];
}

export function useWorkspaceStorageTarget({
  scope,
  yDoc,
  runInYDoc,
}: UseWorkspaceStorageTargetParams) {
  const requireScope = useCallback(() => {
    if (!scope) throw new Error('工作区未就绪');
    return scope;
  }, [scope]);

  const writeLocal = useCallback(
    async (write: (currentScope: WorkspaceScope) => Promise<void>) => {
      const currentScope = requireScope();
      await write(currentScope);
      if (currentScope.kind === 'user') {
        invalidateLegacyWorkspaceMigration(currentScope);
      }
    },
    [requireScope],
  );

  const read = useCallback(
    async <T>({ yDoc: readYDoc, local: readLocal }: WorkspaceReadOperations<T>): Promise<T> => {
      if (yDoc) return readYDoc(yDoc);
      return readLocal(requireScope());
    },
    [requireScope, yDoc],
  );

  const readLocal = useCallback(
    <T>(read: (currentScope: WorkspaceScope) => Promise<T>) => read(requireScope()),
    [requireScope],
  );

  const update = useCallback(
    async <T>({ yDoc: updateYDoc, local }: WorkspaceUpdateOperations<T>): Promise<T> => {
      if (yDoc) {
        let result: T | undefined;
        runInYDoc((doc) => {
          result = updateYDoc(doc);
        });
        return result as T;
      }
      let result: T | undefined;
      await writeLocal(async (currentScope) => {
        result = await local(currentScope);
      });
      return result as T;
    },
    [runInYDoc, writeLocal, yDoc],
  );

  const write = useCallback((operations: WorkspaceWriteOperations) => update(operations), [update]);

  const cleanupLocal = useCallback(
    async (cleanup: (currentScope: WorkspaceScope) => Promise<void>) => {
      if (!yDoc) return;
      await cleanup(requireScope());
    },
    [requireScope, yDoc],
  );

  const removeEverywhere = useCallback(
    async ({ yDoc: removeYDoc, local }: WorkspaceWriteOperations) => {
      if (!yDoc) {
        await writeLocal(local);
        return;
      }
      runInYDoc(removeYDoc);
      await local(requireScope());
    },
    [requireScope, runInYDoc, writeLocal, yDoc],
  );

  return useMemo(
    () => ({
      kind: yDoc ? ('ydoc' as const) : ('indexeddb' as const),
      read,
      readLocal,
      update,
      write,
      cleanupLocal,
      removeEverywhere,
    }),
    [cleanupLocal, read, readLocal, removeEverywhere, update, write, yDoc],
  );
}

export type WorkspaceStorageTarget = ReturnType<typeof useWorkspaceStorageTarget>;
