import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAFT_ID, shouldAcceptSnapshotRecord } from '../snapshotMergePolicy';

describe('snapshotMergePolicy', () => {
  it('使用稳定的默认草稿 id', () => {
    expect(DEFAULT_DRAFT_ID).toBe('default');
  });

  it('目标不存在或传入记录更新时接受快照', () => {
    expect(shouldAcceptSnapshotRecord(1, undefined)).toBe(true);
    expect(shouldAcceptSnapshotRecord(2, 1)).toBe(true);
  });

  it('时间相同或传入记录更旧时保留目标', () => {
    expect(shouldAcceptSnapshotRecord(1, 1)).toBe(false);
    expect(shouldAcceptSnapshotRecord(1, 2)).toBe(false);
  });
});
