import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceMigrationResponse } from '@/types/api';
import {
  analyzeWorkspaceMigration,
  clearWorkspaceMigrationDismissed,
  commitWorkspaceMigration,
  dismissWorkspaceMigration,
  isWorkspaceMigrationDismissed,
  type WorkspaceMigrationPayload,
} from '@/services/workspaceMigrationService';

type PendingWorkspaceMigration = {
  payload: WorkspaceMigrationPayload;
  result: WorkspaceMigrationResponse;
};

export const useWorkspaceMigration = (authState: {
  status: 'loading' | 'signed_out' | 'signed_in';
  accessToken: string | null;
  appUserId: string | null;
}) => {
  const [pending, setPending] = useState<PendingWorkspaceMigration | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (authState.status !== 'signed_in' || !authState.accessToken || !authState.appUserId) {
      setPending(null);
      setOpen(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setChecking(true);
    setError(null);

    void analyzeWorkspaceMigration(authState.accessToken)
      .then((analysis) => {
        if (cancelled || !analysis) return;
        if (analysis.result.status === 'no_data' || analysis.result.status === 'completed') {
          setPending(null);
          setOpen(false);
          return;
        }
        if (isWorkspaceMigrationDismissed(authState.appUserId, analysis.payload.localFingerprint)) {
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
  }, [authState.accessToken, authState.appUserId, authState.status]);

  const dismiss = useCallback(() => {
    if (pending && authState.appUserId) {
      dismissWorkspaceMigration(authState.appUserId, pending.payload.localFingerprint);
    }
    setOpen(false);
  }, [authState.appUserId, pending]);

  const runMigration = useCallback(async () => {
    if (!pending || !authState.accessToken || !authState.appUserId) {
      return null;
    }

    setRunning(true);
    setError(null);
    clearWorkspaceMigrationDismissed(authState.appUserId, pending.payload.localFingerprint);
    try {
      const result = await commitWorkspaceMigration(authState.accessToken, pending.payload);
      setPending(null);
      setOpen(false);
      return result;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '迁移失败');
      throw nextError;
    } finally {
      setRunning(false);
    }
  }, [authState.accessToken, authState.appUserId, pending]);

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
