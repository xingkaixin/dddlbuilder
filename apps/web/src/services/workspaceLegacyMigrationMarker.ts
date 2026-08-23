import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';
import { getWorkspaceScopeStorageKey } from '@/utils/workspaceScope';

/**
 * legacy 迁移（提升 `user:U` 分区 + 把本地分区折叠进 Y.Doc）是每台设备一次性的启动步骤。
 * 完成标记因此写在本设备的 localStorage：它必须活过退出登录时的 clearLocalWorkspaceData
 * （否则清空目标分区后会重新提升一份陈旧 legacy 快照），也不应该跨设备同步
 * （每台设备有各自的 legacy 分区要处理）。
 */
const STORAGE_KEY_PREFIX = 'ddlbuilder:workspace-legacy-migration:v2';

const DONE = 'done';

const buildKey = (scope: WorkspaceScope) =>
  `${STORAGE_KEY_PREFIX}:${getWorkspaceScopeStorageKey(scope)}`;

// localStorage 在隐私模式下连读都可能抛（SecurityError）。这里的任何失败都只应让迁移
// 退化成"下次再跑"，绝不能冒泡到 Y.Doc 启动路径上——那会让 localSynced 卡住、用户编辑被丢弃。
const readMarker = (scope: WorkspaceScope) => {
  try {
    return localStorage.getItem(buildKey(scope));
  } catch (error) {
    console.error('[workspace-yjs] failed to read legacy migration marker', error);
    return null;
  }
};

const writeMarker = (scope: WorkspaceScope, value: string) => {
  try {
    localStorage.setItem(buildKey(scope), value);
  } catch (error) {
    console.error('[workspace-yjs] failed to persist legacy migration marker', error);
  }
};

export const isLegacyWorkspaceMigrationCompleted = (scope: WorkspaceScope) =>
  readMarker(scope) === DONE;

/** 返回本次运行的令牌，收尾时凭它认领结果。 */
export const beginLegacyWorkspaceMigration = (scope: WorkspaceScope) => {
  const token = `running:${crypto.randomUUID()}`;
  writeMarker(scope, token);
  return token;
};

/**
 * 只有当标记仍是本次运行写下的那个令牌时才算完成。令牌必须逐次唯一：
 * 期间若有人写了 legacy 分区（invalidate 抹掉标记）或另一个标签页重新开跑，
 * 本次结果都已经不完整，标记成 done 会让那批数据永远不再迁移。
 */
export const completeLegacyWorkspaceMigration = (scope: WorkspaceScope, token: string) => {
  if (readMarker(scope) !== token) return;
  writeMarker(scope, DONE);
};

export const invalidateLegacyWorkspaceMigration = (scope: WorkspaceScope) => {
  try {
    localStorage.removeItem(buildKey(scope));
  } catch (error) {
    console.error('[workspace-yjs] failed to clear legacy migration marker', error);
  }
};
