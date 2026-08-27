import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import type { WorkspaceMigrationSnapshot } from '@ddlbuilder/shared-types/workspace';
import { normalizeWorkspaceMigrationSnapshot } from '../workspaceSnapshotNormalization';

const state = (tableName: string) =>
  withDefaultEditorSession({
    schemaName: '',
    tableName,
    tableComment: '',
    dbType: 'mysql',
    rows: [],
    indexes: [],
    authInput: '',
    authObjects: [],
  });

const snapshot = (): WorkspaceMigrationSnapshot => ({
  globalDraft: { state: state('global'), updatedAt: 1 },
  drafts: [
    {
      draftId: 'named',
      state: state('stored'),
      createdAt: 2,
      updatedAt: 20,
      folderId: 'folder',
      trashedAt: 20,
    },
  ],
  activeSession: {
    activeSource: { kind: 'draft', draftId: 'named' },
    activeState: state('session'),
    updatedAt: 30,
  },
  savedTables: [],
  savedDrafts: [],
  folders: [],
});

describe('normalizeWorkspaceMigrationSnapshot', () => {
  it('按活动草稿 ID 合并并保留其他草稿及元数据', () => {
    const input = snapshot();
    const result = normalizeWorkspaceMigrationSnapshot(input);
    expect(result.globalDraft).toBeNull();
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[0]).toMatchObject({ draftId: 'default', state: { tableName: 'global' } });
    expect(result.drafts[1]).toMatchObject({
      draftId: 'named',
      state: { tableName: 'session' },
      createdAt: 2,
      updatedAt: 30,
      folderId: 'folder',
      trashedAt: 20,
    });
    expect(result.drafts[1].state).not.toHaveProperty('addCount');
    expect(input.drafts[0].state.tableName).toBe('stored');
    expect(normalizeWorkspaceMigrationSnapshot({ ...input, ...result })).toEqual(result);
  });

  it.each([10, 20])('旧或同时间会话不覆盖已保存草稿 (%s)', (updatedAt) => {
    const input = snapshot();
    input.activeSession!.updatedAt = updatedAt;
    expect(normalizeWorkspaceMigrationSnapshot(input).drafts[1]).toEqual(input.drafts[0]);
  });

  it('先归一化全局草稿再比较默认草稿会话时间', () => {
    const input = snapshot();
    input.globalDraft = { state: state('newer_global'), updatedAt: 40 };
    input.activeSession!.activeSource = { kind: 'draft', draftId: 'default' };
    const result = normalizeWorkspaceMigrationSnapshot(input);
    expect(result.drafts[0]).toMatchObject({ state: { tableName: 'newer_global' }, updatedAt: 40 });
    expect(result.drafts[1]).toEqual(input.drafts[0]);
  });

  it('仅活动会话有内容时创建原 ID 的草稿', () => {
    const input = { ...snapshot(), globalDraft: null, drafts: [] };
    expect(normalizeWorkspaceMigrationSnapshot(input).drafts).toEqual([
      expect.objectContaining({
        draftId: 'named',
        state: expect.objectContaining({ tableName: 'session' }),
      }),
    ]);
  });

  it.each([
    null,
    {
      activeSource: { kind: 'draft' as const, draftId: 'named' },
      activeState: null,
      updatedAt: 30,
    },
    {
      activeSource: { kind: 'saved_table' as const, normalizedName: 'table' },
      activeState: state('saved'),
      updatedAt: 30,
    },
  ])('非草稿内容不产生额外草稿 (%j)', (activeSession) => {
    const input = { ...snapshot(), activeSession };
    const result = normalizeWorkspaceMigrationSnapshot(input);
    expect(result.drafts).toHaveLength(2);
    expect(result.drafts[1]).toEqual(input.drafts[0]);
  });
});
