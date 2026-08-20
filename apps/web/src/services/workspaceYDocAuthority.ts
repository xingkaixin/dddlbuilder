/**
 * Workspace sync authority: Y.Doc is the client runtime source of truth for workspace content,
 * IndexedDB is its browser-local cache and offline startup copy, Durable Object storage holds the
 * server-side Yjs update log plus compacted snapshot, and D1 `workspace_entities` remains a legacy
 * HTTP recovery projection until Yjs checkpoints own that projection.
 */
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

export type WorkspaceYDocStartupStep =
  | 'load-indexeddb-ydoc'
  | 'merge-legacy-indexeddb-snapshot'
  | 'connect-durable-object';

export type WorkspaceYDocStartupPlan =
  | {
      enabled: false;
      reason: 'signed-out' | 'missing-workspace';
    }
  | {
      enabled: true;
      scope: Extract<WorkspaceScope, { kind: 'user' }> & { workspaceId: string };
      steps: WorkspaceYDocStartupStep[];
      d1Persistence: 'durable-object-checkpoint';
      queueEntityOutbox: false;
    };

type UserWorkspaceScope = Extract<WorkspaceScope, { kind: 'user' }> & { workspaceId: string };

export const resolveWorkspaceYDocStartupPlan = (input: {
  authStatus: 'loading' | 'signed_in' | 'signed_out';
  userId?: string | null;
  workspaceId?: string | null;
  legacyMigrationCompleted: boolean;
}): WorkspaceYDocStartupPlan => {
  // refreshSession 会把 status 打回 loading 但保留 userId/workspaceId。身份没变时不能判成
  // signed-out：那会拆掉一个健康的 Y.Doc，连带把整个界面退回启动态。
  const identityKnown = Boolean(input.userId && input.workspaceId);
  if (input.authStatus === 'signed_out' || (input.authStatus === 'loading' && !identityKnown)) {
    return { enabled: false, reason: 'signed-out' };
  }

  if (!input.userId || !input.workspaceId) {
    return { enabled: false, reason: 'missing-workspace' };
  }

  return {
    enabled: true,
    scope: {
      kind: 'user',
      userId: input.userId,
      workspaceId: input.workspaceId,
    },
    // legacy 迁移完成后必须彻底跳过：本地分区仍在被 HTTP 拉取写入，重复折叠会把 Y.Doc 里
    // 已删除的实体推回去（合并按 updatedAt 比较，没有墓碑语义）。
    steps: [
      'load-indexeddb-ydoc',
      ...(input.legacyMigrationCompleted ? [] : (['merge-legacy-indexeddb-snapshot'] as const)),
      'connect-durable-object',
    ],
    d1Persistence: 'durable-object-checkpoint',
    queueEntityOutbox: false,
  };
};

/**
 * 只要浏览器已经确定持有登录会话，匿名分区就不是正确的写入目标；而在该 workspace 的 Y.Doc
 * 本地加载完成之前，写入只会落到 `user:<id>` 或 anonymous 分区，之后不会被合并回来
 * （legacy 提升是一次性的，完成标记写下后不再重跑）。这段窗口必须整段挡住。
 * 判据同时看 userId 而不只看 status：refreshSession 期间 status 会退回 loading 但 userId 保留，
 * 放行那一段会在重试时闪出一个可写的空工作区。
 */
export const isWorkspaceWriteTargetPending = (input: {
  authStatus: 'loading' | 'signed_in' | 'signed_out';
  userId?: string | null;
  localSynced: boolean;
}) => (input.authStatus === 'signed_in' || Boolean(input.userId)) && !input.localSynced;

export const shouldQueueWorkspaceEntityOutbox = (input: {
  scope: WorkspaceScope | null | undefined;
  yDocReady: boolean;
}): input is { scope: UserWorkspaceScope; yDocReady: false } =>
  input.scope?.kind === 'user' && Boolean(input.scope.workspaceId) && input.yDocReady === false;
