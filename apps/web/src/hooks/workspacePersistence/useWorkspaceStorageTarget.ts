import { useMemo } from 'react';
import type * as Y from 'yjs';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import type { useWorkspaceYDocGateway } from '@/hooks/useWorkspaceYDocGateway';
import i18n from '@/i18n';

interface UseWorkspaceStorageTargetParams {
  scope: WorkspaceScope | null;
  yDoc: Y.Doc | null;
  runInYDoc: ReturnType<typeof useWorkspaceYDocGateway>['runInYDoc'];
}

type WorkspaceYDocStorage = {
  kind: 'ydoc';
  scope: WorkspaceScope;
  yDoc: Y.Doc;
  transact: ReturnType<typeof useWorkspaceYDocGateway>['runInYDoc'];
};

type WorkspaceIndexedDbStorage = {
  kind: 'indexeddb';
  scope: Extract<WorkspaceScope, { kind: 'anonymous' }>;
};

type WorkspaceLoadingStorage = {
  kind: 'loading';
  scope: WorkspaceScope | null;
};

export type WorkspaceStorageTarget =
  | WorkspaceYDocStorage
  | WorkspaceIndexedDbStorage
  | WorkspaceLoadingStorage;

export type ReadyWorkspaceStorage = Exclude<WorkspaceStorageTarget, WorkspaceLoadingStorage>;

export const requireReadyWorkspaceStorage = (
  storage: WorkspaceStorageTarget,
): ReadyWorkspaceStorage => {
  if (storage.kind === 'loading') throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
  return storage;
};

export function useWorkspaceStorageTarget({
  scope,
  yDoc,
  runInYDoc,
}: UseWorkspaceStorageTargetParams) {
  return useMemo<WorkspaceStorageTarget>(() => {
    if (yDoc && scope) return { kind: 'ydoc', scope, yDoc, transact: runInYDoc };
    if (scope?.kind === 'anonymous') return { kind: 'indexeddb', scope };
    return { kind: 'loading', scope };
  }, [runInYDoc, scope, yDoc]);
}
