import { useCallback } from 'react';
import type * as Y from 'yjs';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';

type WorkspaceYDocGatewayOptions = {
  enabled?: boolean;
  origin?: unknown;
};

export function useWorkspaceYDocGateway(
  scope: WorkspaceScope | null,
  { enabled = true, origin }: WorkspaceYDocGatewayOptions = {},
) {
  const workspaceYDoc = useWorkspaceYDoc();
  const yDocReady = Boolean(
    enabled &&
    workspaceYDoc.doc &&
    workspaceYDoc.localSynced &&
    scope?.kind === 'user' &&
    scope.workspaceId,
  );
  // 非空即就绪：读写路径都以它判断该走 Y.Doc 还是本地分区，避免重复的布尔+判空对。
  const yDoc = yDocReady ? workspaceYDoc.doc : null;

  const runInYDoc = useCallback(
    (mutate: (doc: Y.Doc) => void) => {
      if (!yDoc) return;
      yDoc.transact(() => mutate(yDoc), origin);
    },
    [origin, yDoc],
  );

  return { workspaceYDoc, yDoc, yDocReady, runInYDoc };
}
