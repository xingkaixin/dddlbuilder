import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';
import { WORKSPACE_SNAPSHOT_APPLIED_EVENT } from '@/services/workspaceSyncService';
import { workspaceLocalQueryKeys } from '@/queries/workspaceLocal';
import { useWorkspaceScope } from '@/hooks/useWorkspaceScope';
import { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import type * as Y from 'yjs';

type WorkspaceEntityRead<T> = {
  fromYDoc: (doc: Y.Doc) => T | Promise<T>;
  fromLocal: (scope: NonNullable<ReturnType<typeof useWorkspaceScope>>) => T | Promise<T>;
};

type WorkspaceEntityWrite = {
  toYDoc: (doc: Y.Doc) => void;
  toLocal: (scope: NonNullable<ReturnType<typeof useWorkspaceScope>>) => Promise<void>;
};

export function useWorkspaceEntityPersistence() {
  const scope = useWorkspaceScope();
  const queryClient = useQueryClient();
  const yDocGateway = useWorkspaceYDocGateway(scope);
  const { yDoc, runInYDoc } = yDocGateway;

  const refresh = useCallback(async () => {
    if (!scope) return;
    await queryClient.invalidateQueries({
      queryKey: workspaceLocalQueryKeys.scope(scope),
    });
  }, [queryClient, scope]);

  const writeLocalFallback = useCallback(
    async (write: () => Promise<void>) => {
      await write();
      if (scope?.kind === 'user' && scope.workspaceId) {
        invalidateLegacyWorkspaceMigration(scope);
      }
    },
    [scope],
  );

  const read = useCallback(
    async <T>({ fromYDoc, fromLocal }: WorkspaceEntityRead<T>): Promise<T> => {
      if (yDoc) {
        return fromYDoc(yDoc);
      }
      if (!scope) throw new Error('工作区未就绪');
      return fromLocal(scope);
    },
    [scope, yDoc],
  );

  const write = useCallback(
    async ({ toYDoc, toLocal }: WorkspaceEntityWrite) => {
      if (yDoc) {
        runInYDoc(toYDoc);
        return;
      }
      if (!scope) throw new Error('工作区未就绪');
      await writeLocalFallback(() => toLocal(scope));
    },
    [runInYDoc, scope, writeLocalFallback, yDoc],
  );

  useEffect(() => {
    const handleSnapshotApplied = () => void refresh();
    window.addEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
    return () =>
      window.removeEventListener(WORKSPACE_SNAPSHOT_APPLIED_EVENT, handleSnapshotApplied);
  }, [refresh]);

  return {
    scope,
    ...yDocGateway,
    refresh,
    read,
    write,
    writeLocalFallback,
  };
}
