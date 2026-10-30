import { useCallback, useReducer } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkspaceYDoc } from '@/providers/WorkspaceYDocProvider';
import type { WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import {
  clearWorkspaceMigrationDismissed,
  commitWorkspaceMigration,
  dismissWorkspaceMigration,
  type WorkspaceMigrationPayload,
} from '@/services/workspaceMigrationService';
import {
  workspaceMigrationProposalOptions,
  workspaceMigrationQueryKeys,
} from '@/queries/workspaceMigration';

type MigrationDialogState = { fingerprint: string | null; open: boolean };

type MigrationDialogEvent =
  | { type: 'openChanged'; fingerprint: string | null; open: boolean }
  | { type: 'closed'; fingerprint: string | null };

const migrationDialogReducer = (
  _state: MigrationDialogState,
  event: MigrationDialogEvent,
): MigrationDialogState => ({
  fingerprint: event.fingerprint,
  open: event.type === 'openChanged' && event.open,
});

type CommitVariables = { workspaceKey: string; payload: WorkspaceMigrationPayload };

export const useWorkspaceMigration = (authState: {
  status: 'loading' | 'signed_out' | 'signed_in';
  userId: string | null;
  workspaceId: string | null;
}) => {
  const { doc, localSynced, synced } = useWorkspaceYDoc();
  const queryClient = useQueryClient();

  const [dialogState, dispatchDialog] = useReducer(migrationDialogReducer, {
    fingerprint: null,
    open: false,
  });
  const ready = Boolean(
    authState.status === 'signed_in' &&
    authState.userId &&
    authState.workspaceId &&
    doc &&
    localSynced &&
    synced,
  );
  const userId = authState.userId ?? '';
  const workspaceId = authState.workspaceId ?? '';
  const workspaceKey = `${userId}:${workspaceId}`;

  const proposalQuery = useQuery({
    ...workspaceMigrationProposalOptions(userId, workspaceId, doc),
    enabled: ready,
  });
  const {
    mutateAsync: commitMigration,
    reset: resetCommitMutation,
    isPending,
    error: mutationError,
    variables: commitVariables,
  } = useMutation<WorkspaceMigrationResponse, unknown, CommitVariables>({
    mutationFn: ({ payload }) => commitWorkspaceMigration(payload),
    retry: false,
  });
  // 提交状态只属于发起它的账号与工作区；切换后不展示上一个工作区的进行中或失败状态。
  const commitIsCurrent = commitVariables?.workspaceKey === workspaceKey;
  const running = commitIsCurrent && isPending;
  const commitError = commitIsCurrent ? mutationError : null;
  const pending = proposalQuery.data ?? null;
  const fingerprint = pending?.payload.localFingerprint ?? null;

  const open =
    ready && (dialogState.fingerprint === fingerprint ? dialogState.open : Boolean(pending));

  const setOpen = useCallback(
    (nextOpen: boolean) => dispatchDialog({ type: 'openChanged', fingerprint, open: nextOpen }),
    [fingerprint],
  );

  const dismiss = useCallback(() => {
    if (pending && authState.userId) {
      dismissWorkspaceMigration(authState.userId, pending.payload.localFingerprint);
    }

    dispatchDialog({ type: 'closed', fingerprint });
  }, [authState.userId, fingerprint, pending]);

  const runMigration = useCallback(async () => {
    if (!pending || !authState.userId || !authState.workspaceId) return null;

    resetCommitMutation();
    clearWorkspaceMigrationDismissed(authState.userId, pending.payload.localFingerprint);
    const result = await commitMigration({ workspaceKey, payload: pending.payload });
    queryClient.setQueryData(
      workspaceMigrationQueryKeys.proposal(authState.userId, authState.workspaceId),
      null,
    );
    dispatchDialog({ type: 'closed', fingerprint });

    return result;
  }, [
    authState.userId,
    authState.workspaceId,
    commitMigration,
    fingerprint,
    pending,
    queryClient,
    resetCommitMutation,
    workspaceKey,
  ]);

  const error = proposalQuery.error
    ? proposalQuery.error instanceof Error
      ? proposalQuery.error.message
      : '迁移检查失败'
    : commitError
      ? commitError instanceof Error
        ? commitError.message
        : '迁移失败'
      : null;

  return {
    checking: ready && proposalQuery.isPending,
    running,
    open,
    pending,
    error,
    setOpen,
    dismiss,
    runMigration,
  };
};
