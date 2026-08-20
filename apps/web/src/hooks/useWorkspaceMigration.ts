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
import { invalidateLegacyWorkspaceMigration } from '@/services/workspaceLegacyMigrationMarker';

type PendingWorkspaceMigration = {
  payload: WorkspaceMigrationPayload;
  result: WorkspaceMigrationResponse;
};

// 匿名工作区落到 legacy `user:U` 分区，只能靠启动时的 legacy 迁移进 Y.Doc，
// 所以写完必须清掉当前 workspace 的完成标记，否则这批数据永远不会被看到。
const adoptWorkspaceMigrationPayload = async (
  payload: WorkspaceMigrationPayload,
  userId: string,
  workspaceId: string,
) => {
  await applyWorkspaceMigrationPayloadToLocal(payload, { kind: 'user', userId });
  invalidateLegacyWorkspaceMigration({ kind: 'user', userId, workspaceId });
};

export const useWorkspaceMigration = (authState: {
  status: 'loading' | 'signed_out' | 'signed_in';
  userId: string | null;
  workspaceId: string | null;
}) => {
  const [pending, setPending] = useState<PendingWorkspaceMigration | null>(null);
  const [checking, setChecking] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // workspace 未解析出来之前不能采纳匿名数据：不知道该让哪个 workspace 重跑 legacy 迁移。
    if (authState.status !== 'signed_in' || !authState.userId || !authState.workspaceId) {
      setPending(null);
      setOpen(false);
      setError(null);
      return;
    }
    const userId = authState.userId;
    const workspaceId = authState.workspaceId;

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
          userId,
        });
        if (userScopeHasLocalData) {
          setPending(null);
          setOpen(false);
          return;
        }
        await adoptWorkspaceMigrationPayload(analysis.payload, userId, workspaceId);
        if (isWorkspaceMigrationDismissed(userId, analysis.payload.localFingerprint)) {
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
  }, [authState.status, authState.userId, authState.workspaceId]);

  const dismiss = useCallback(() => {
    if (pending && authState.userId) {
      dismissWorkspaceMigration(authState.userId, pending.payload.localFingerprint);
    }
    setOpen(false);
  }, [authState.userId, pending]);

  const runMigration = useCallback(async () => {
    if (!pending || !authState.userId || !authState.workspaceId) {
      return null;
    }

    setRunning(true);
    setError(null);
    clearWorkspaceMigrationDismissed(authState.userId, pending.payload.localFingerprint);
    try {
      const result = await commitWorkspaceMigration(pending.payload);
      await adoptWorkspaceMigrationPayload(
        pending.payload,
        authState.userId,
        authState.workspaceId,
      );
      setPending(null);
      setOpen(false);
      return result;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '迁移失败');
      throw nextError;
    } finally {
      setRunning(false);
    }
  }, [authState.userId, authState.workspaceId, pending]);

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
