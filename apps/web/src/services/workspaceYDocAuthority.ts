/**
 * Workspace sync authority: Y.Doc is the client runtime source of truth for workspace content,
 * IndexedDB is its browser-local cache and offline startup copy, Durable Object storage holds the
 * server-side Yjs update log plus compacted snapshot. D1 `workspace_entities` is only a checkpoint
 * projection written by the Durable Object; clients never synchronize it independently.
 * Signing out closes synchronization and removes the account's browser-local content copy.
 */

/**
 * 只要浏览器已经确定持有登录会话，匿名分区就不是正确的写入目标；而在该 workspace 的 Y.Doc
 * 本地加载完成之前若错误放行，写入只会落到 anonymous 分区，之后不会被合并回来
 * （legacy 提升是一次性的，完成标记写下后不再重跑）。这段窗口必须整段挡住。
 * 本地工作区身份独立于云端会话。身份尚未确定时也应等待，不能提前展示匿名空工作区。
 */
export const isWorkspaceWriteTargetPending = (input: {
  authStatus: 'loading' | 'signed_in' | 'signed_out';
  userId?: string | null;
  localSynced: boolean;
}) => (input.authStatus !== 'signed_out' || Boolean(input.userId)) && !input.localSynced;
