import type { QueryClient } from '@tanstack/react-query';
import type { UserWorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { toast } from 'sonner';
import { i18n } from '@/i18n';
import { markWorkspaceCleanupPending } from '@/services/workspaceCacheRegistry';
import { writeWorkspaceIdentity } from '@/services/workspaceIdentity';
import { authQueryKeys, currentUserOptions } from '@/queries/auth';
import { creditQueryKeys } from '@/queries/credits';
import { workspaceQueryKeys } from '@/queries/workspaces';

const workspaceMigrationUserQueryKey = (userId: string) => ['workspace-migration', userId] as const;

interface ExecuteWorkspaceSignOutInput {
  scope: UserWorkspaceScope | null;
  userId: string | null;
  queryClient: QueryClient;
  remoteSignOut: () => Promise<void>;
}

export const executeWorkspaceSignOut = async ({
  scope,
  userId,
  queryClient,
  remoteSignOut,
}: ExecuteWorkspaceSignOutInput) => {
  if (scope) {
    try {
      const { prepareWorkspaceSignOut } = await import('@/services/workspaceYDocStorage');
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
    const retryCleanup = async () => {
      if (!cleanupRegistered) {
        // 其他标签重新登录时可能沿用同一条本地身份记录。
        const session = await queryClient.fetchQuery({
          ...currentUserOptions(),
          staleTime: 0,
          networkMode: 'always',
        });

        if (session.signedIn) return;
        markWorkspaceCleanupPending(scope);
        cleanupRegistered = true;
      }

      const { retryWorkspaceCleanup } = await import('@/services/workspaceAccountService');
      await retryWorkspaceCleanup(scope.userId);
    };

    const showCleanupFailure = () => {
      toast.error(i18n.t('workspaceYDoc.signOut.cleanupFailed'), {
        action: {
          label: i18n.t('workspaceYDoc.signOut.retryCleanup'),
          onClick: () => {
            void retryCleanup().catch((error) => {
              console.error('[workspace] cleanup retry failed', error);
              showCleanupFailure();
            });
          },
        },
      });
    };

    try {
      markWorkspaceCleanupPending(scope);
      cleanupRegistered = true;
      const { clearLocalWorkspaceData } = await import('@/services/workspaceAccountService');
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
      showCleanupFailure();
    }
  }

  if (userId) {
    queryClient.removeQueries({ queryKey: creditQueryKeys.all(userId) });
    queryClient.removeQueries({ queryKey: workspaceQueryKeys.all(userId) });
    queryClient.removeQueries({ queryKey: workspaceMigrationUserQueryKey(userId) });
  }

  queryClient.setQueryData(authQueryKeys.me, { signedIn: false, user: null });

  if (cleanupRegistered) writeWorkspaceIdentity(null);
};
