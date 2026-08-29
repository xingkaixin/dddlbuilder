import type { QueryClient } from '@tanstack/react-query';
import type { UserWorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { markWorkspaceCleanupPending } from '@/services/workspaceCacheRegistry';
import { clearLocalWorkspaceData } from '@/services/workspaceAccountService';
import { prepareWorkspaceSignOut } from '@/services/workspaceYDocStorage';
import {
  parseWorkspaceIdentity,
  readWorkspaceIdentity,
  writeWorkspaceIdentity,
} from '@/services/workspaceIdentity';
import { authQueryKeys } from '@/queries/auth';
import { creditQueryKeys } from '@/queries/credits';
import { workspaceQueryKeys } from '@/queries/workspaces';
import { workspaceMigrationQueryKeys } from '@/queries/workspaceMigration';

interface ExecuteWorkspaceSignOutInput {
  scope: UserWorkspaceScope | null;
  userId: string | null;
  queryClient: QueryClient;
  remoteSignOut: () => Promise<void>;
}

const retryWorkspaceCleanup = (scope: UserWorkspaceScope) => {
  void clearLocalWorkspaceData(scope)
    .then(() => {
      if (parseWorkspaceIdentity(readWorkspaceIdentity())?.userId === scope.userId) {
        writeWorkspaceIdentity(null);
      }
    })
    .catch((error: unknown) => {
      console.error('[workspace] cleanup retry failed', error);
      toast.error(i18n.t('workspaceYDoc.signOut.cleanupFailed'));
    });
};

export const executeWorkspaceSignOut = async ({
  scope,
  userId,
  queryClient,
  remoteSignOut,
}: ExecuteWorkspaceSignOutInput) => {
  if (scope) {
    try {
      await prepareWorkspaceSignOut(scope.workspaceId);
    } catch (error) {
      console.error('[workspace-yjs] sign out cancelled to preserve local changes', error);
      throw new Error(i18n.t('workspaceYDoc.signOut.unsynced'));
    }
  }

  await remoteSignOut();
  await queryClient.cancelQueries({ queryKey: authQueryKeys.me });

  let cleanupRegistered = !scope;
  if (scope) {
    try {
      markWorkspaceCleanupPending(scope);
      cleanupRegistered = true;
      await clearLocalWorkspaceData(scope);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: 'sign_out_local_cleanup_failure',
          userId: scope.userId,
          workspaceId: scope.workspaceId,
        }),
        error,
      );
      toast.error(i18n.t('workspaceYDoc.signOut.cleanupFailed'), {
        action: {
          label: i18n.t('workspaceYDoc.signOut.retryCleanup'),
          onClick: () => retryWorkspaceCleanup(scope),
        },
      });
    }
  }

  if (userId) {
    queryClient.removeQueries({ queryKey: creditQueryKeys.all(userId) });
    queryClient.removeQueries({ queryKey: workspaceQueryKeys.all(userId) });
    queryClient.removeQueries({ queryKey: workspaceMigrationQueryKeys.all(userId) });
  }
  queryClient.setQueryData(authQueryKeys.me, { signedIn: false, user: null });
  if (cleanupRegistered) writeWorkspaceIdentity(null);
};
