import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceMigrationResponse } from '@ddlbuilder/shared-types/api';
import {
  analyzeWorkspaceMigration,
  applyWorkspaceMigrationPayloadToLocal,
  clearWorkspaceMigrationDismissed,
  commitWorkspaceMigration,
  dismissWorkspaceMigration,
  hasMeaningfulWorkspaceData,
  isWorkspaceMigrationDismissed,
  type WorkspaceMigrationPayload,
} from '@/services/workspaceMigrationService';

type PendingWorkspaceMigration = {
  payload: WorkspaceMigrationPayload;
  result: WorkspaceMigrationResponse;
};

export const useWorkspaceMigration = (authState: {
  status: 'loading' | 'signed_out' | 'signed_in';
  userId: string | null;
}) => {
  const [pending, setPending] = useState<PendingWorkspaceMigration | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (authState.status !== 'signed_in' || !authState.userId) {
      setPending(null);
      setOpen(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setChecking(true);
    setError(null);

    void analyzeWorkspaceMigration()
      .then(async (analysis) => {
        if (cancelled || !analysis) return;
        if (analysis.result.status === 'no_data' || analysis.result.status === 'completed') {
          setPending(null);
          setOpen(false);
          return;
        }
        const userScopeHasLocalData = await hasMeaningfulWorkspaceData({
          kind: 'user',
          userId: authState.userId,
        });
        if (userScopeHasLocalData) {
          setPending(null);
          setOpen(false);
          return;
        }
        await applyWorkspaceMigrationPayloadToLocal(analysis.payload, {
          kind: 'user',
          userId: authState.userId,
        });
        if (isWorkspaceMigrationDismissed(authState.userId, analysis.payload.localFingerprint)) {
          return;
        }
        setPending(analysis);
        setOpen(true);
      })
      .catch((nextError) => {
        if (cancelled) return;
        setError(nextError instanceof Error ? nextError.message : '迁移检查失败');
      })
      .finally(() => {
        if (!cancelled) {
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authState.status, authState.userId]);

  const dismiss = useCallback(() => {
    if (pending && authState.userId) {
      dismissWorkspaceMigration(authState.userId, pending.payload.localFingerprint);
    }
    setOpen(false);
  }, [authState.userId, pending]);

  const runMigration = useCallback(async () => {
    if (!pending || !authState.userId) {
      return null;
    }

    setRunning(true);
    setError(null);
    clearWorkspaceMigrationDismissed(authState.userId, pending.payload.localFingerprint);
    try {
      const result = await commitWorkspaceMigration(pending.payload);
      await applyWorkspaceMigrationPayloadToLocal(pending.payload, {
        kind: 'user',
        userId: authState.userId,
      });
      setPending(null);
      setOpen(false);
      return result;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '迁移失败');
      throw nextError;
    } finally {
      setRunning(false);
    }
  }, [authState.userId, pending]);

  return {
    checking,
    running,
    open,
    pending,
    error,
    setOpen,
    dismiss,
    runMigration,
  };
};
