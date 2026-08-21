export const DEFAULT_DRAFT_ID = 'default';

// 快照灌入（IndexedDB 迁移、legacy 提升、Y.Doc legacy 合并）共用同一裁决：
// 目标记录缺失或来者 updatedAt 更新时接受；平局保留现状，避免重复灌入反复翻转内容。
export const shouldAcceptSnapshotRecord = (
  incomingUpdatedAt: number,
  targetUpdatedAt: number | undefined,
) => targetUpdatedAt == null || incomingUpdatedAt > targetUpdatedAt;
