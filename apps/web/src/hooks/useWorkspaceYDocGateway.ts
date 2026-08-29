import { useCallback } from 'react';
import type * as Y from 'yjs';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { useWorkspaceYDocDocument } from '@/providers/WorkspaceYDocProvider';
import { WorkspaceYDocOrigin } from '@/services/workspaceYDocAdapter';
import i18n from '@/i18n';

type WorkspaceYDocGatewayOptions = {
  enabled?: boolean;
};

export function useWorkspaceYDocGateway(
  scope: WorkspaceScope | null,
  { enabled = true }: WorkspaceYDocGatewayOptions = {},
) {
  const workspaceYDoc = useWorkspaceYDocDocument();
  const yDocReady = Boolean(
    enabled && workspaceYDoc.doc && workspaceYDoc.localSynced && scope?.kind === 'user',
  );
  // 非空即就绪：读写路径都以它判断该走 Y.Doc 还是本地分区，避免重复的布尔+判空对。
  const yDoc = yDocReady ? workspaceYDoc.doc : null;

  const runInYDoc = useCallback(
    <T>(mutate: (doc: Y.Doc) => T): T => {
      if (!yDoc) throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
      let outcome: { value: T } | undefined;
      yDoc.transact(() => {
        outcome = { value: mutate(yDoc) };
      }, WorkspaceYDocOrigin.LocalEdit);
      if (!outcome) throw new Error(i18n.t('savedTables.toast.workspaceNotReady'));
      return outcome.value;
    },
    [yDoc],
  );

  return { workspaceYDoc, yDoc, yDocReady, runInYDoc };
}
