import { queryOptions } from '@tanstack/react-query';
import {
  analyzeWorkspaceMigration,
  hasMeaningfulWorkspaceData,
  isWorkspaceMigrationDismissed,
} from '@/services/workspaceMigrationService';

export const workspaceMigrationQueryKeys = {
  all: (userId: string) => ['workspace-migration', userId] as const,
  proposal: (userId: string, workspaceId: string) =>
    ['workspace-migration', userId, workspaceId, 'proposal'] as const,
};

export function workspaceMigrationProposalOptions(userId: string, workspaceId: string) {
  return queryOptions({
    queryKey: workspaceMigrationQueryKeys.proposal(userId, workspaceId),
    queryFn: async () => {
      const analysis = await analyzeWorkspaceMigration();
      if (
        !analysis ||
        analysis.result.status === 'no_data' ||
        analysis.result.status === 'completed'
      ) {
        return null;
      }

      const scope = { kind: 'user' as const, userId, workspaceId };
      if (await hasMeaningfulWorkspaceData(scope)) return null;

      return isWorkspaceMigrationDismissed(userId, analysis.payload.localFingerprint)
        ? null
        : analysis;
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
