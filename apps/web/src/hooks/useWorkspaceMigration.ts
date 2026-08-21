import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export const useWorkspaceMigration = (authState: {
  status: 'loading' | 'signed_out' | 'signed_in';
  userId: string | null;
  workspaceId: string | null;
}) => {
  const queryClient = useQueryClient();
  const [dialogState, setDialogState] = useState<{
    fingerprint: string | null;
    open: boolean;
  }>({ fingerprint: null, open: false });
  const ready = Boolean(
    authState.status === 'signed_in' && authState.userId && authState.workspaceId,
  );
  const userId = authState.userId ?? '';
  const workspaceId = authState.workspaceId ?? '';
  const proposalQuery = useQuery({
    ...workspaceMigrationProposalOptions(userId, workspaceId),
    enabled: ready,
  });
  const {
    mutateAsync: commitMigration,
    reset: resetCommitMutation,
    isPending: running,
    error: commitError,
  } = useMutation<WorkspaceMigrationResponse, unknown, WorkspaceMigrationPayload>({
    mutationFn: (payload) => commitWorkspaceMigration(payload),
    retry: false,
  });
  const pending = proposalQuery.data ?? null;
  const fingerprint = pending?.payload.localFingerprint ?? null;
  const open =
    ready && (dialogState.fingerprint === fingerprint ? dialogState.open : Boolean(pending));

  useEffect(() => {
    resetCommitMutation();
  }, [resetCommitMutation, userId, workspaceId]);

  const setOpen = useCallback(
    (nextOpen: boolean) => setDialogState({ fingerprint, open: nextOpen }),
    [fingerprint],
  );

  const dismiss = useCallback(() => {
    if (pending && authState.userId) {
      dismissWorkspaceMigration(authState.userId, pending.payload.localFingerprint);
    }
    setDialogState({ fingerprint, open: false });
  }, [authState.userId, fingerprint, pending]);

  const runMigration = useCallback(async () => {
    if (!pending || !authState.userId || !authState.workspaceId) return null;

    resetCommitMutation();
    clearWorkspaceMigrationDismissed(authState.userId, pending.payload.localFingerprint);
    const result = await commitMigration(pending.payload);
    queryClient.setQueryData(
      workspaceMigrationQueryKeys.proposal(authState.userId, authState.workspaceId),
      null,
    );
    setDialogState({ fingerprint, open: false });
    return result;
  }, [
    authState.userId,
    authState.workspaceId,
    commitMigration,
    fingerprint,
    pending,
    queryClient,
    resetCommitMutation,
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
