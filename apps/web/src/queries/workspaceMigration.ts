import { queryOptions } from '@tanstack/react-query';
import {
  analyzeWorkspaceMigration,
  applyWorkspaceMigrationPayloadToLocal,
  hasMeaningfulWorkspaceData,
  isWorkspaceMigrationDismissed,
} from '@/services/workspaceMigrationService';
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';

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

      const scope = { kind: 'user' as const, userId };
      if (await hasMeaningfulWorkspaceData(scope)) return null;

      await applyWorkspaceMigrationPayloadToLocal(analysis.payload, scope);
      invalidateLegacyWorkspaceMigration({ ...scope, workspaceId });

      return isWorkspaceMigrationDismissed(userId, analysis.payload.localFingerprint)
        ? null
        : analysis;
    },
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}
