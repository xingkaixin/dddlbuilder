import { queryOptions } from '@tanstack/react-query';
import type * as Y from 'yjs';
import { isWorkspaceYDocEmpty } from '@/services/workspaceYDocAdapter';
import {
  analyzeWorkspaceMigration,
  isWorkspaceMigrationDismissed,
} from '@/services/workspaceMigrationService';

export const workspaceMigrationQueryKeys = {
  all: (userId: string) => ['workspace-migration', userId] as const,
  proposal: (userId: string, workspaceId: string) =>
    ['workspace-migration', userId, workspaceId, 'proposal'] as const,
};

export function workspaceMigrationProposalOptions(
  userId: string,
  workspaceId: string,
  doc: Y.Doc | null,
) {
  return queryOptions({
    queryKey: workspaceMigrationQueryKeys.proposal(userId, workspaceId),
    queryFn: async () => {
      if (!doc || !isWorkspaceYDocEmpty(doc)) return null;
      const analysis = await analyzeWorkspaceMigration();
      if (
        !analysis ||
        analysis.result.status === 'no_data' ||
        analysis.result.status === 'completed'
      ) {
        return null;
      }

      return isWorkspaceMigrationDismissed(userId, analysis.payload.localFingerprint)
        ? null
        : analysis;
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
