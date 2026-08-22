import { describe, expect, it } from 'vitest';
import type { PersistedState } from '@ddlbuilder/shared-types';
import type { SavedTableRecord } from '@/utils/savedTablesDb';
import { buildSavedTableBatchImportPlan } from '@/utils/savedTableBatchImport';

const createState = (tableName: string): PersistedState => ({
  schemaName: '',
  tableName,
  tableComment: '',
  dbType: 'mysql',
  sqlFormatMode: 'compact',
  rows: [],
  addCount: 1,
  indexInput: '',
  currentIndexFields: [],
  indexes: [],
  authInput: '',
  authObjects: [],
});

const createRecord = (
  normalizedName: string,
  name: string,
  options: Partial<SavedTableRecord> = {},
): SavedTableRecord => ({
  normalizedName,
  name,
  state: createState(name),
  createdAt: 10,
  updatedAt: 20,
  ...options,
});

describe('buildSavedTableBatchImportPlan', () => {
  it('使用规范化名称识别冲突，并在同一批次内继续识别重复项', () => {
    const plan = buildSavedTableBatchImportPlan(
      {
        items: [
          { name: ' Demo ', state: createState('first') },
          { name: 'New', state: createState('new') },
          { name: ' new ', state: createState('duplicate-new') },
        ],
        conflictStrategy: 'skip',
      },
      [createRecord('demo', 'Demo')],
      100,
    );

    expect(plan.successCount).toBe(1);
    expect(plan.skipCount).toBe(2);
    expect(plan.records).toEqual([expect.objectContaining({ normalizedName: 'new', name: 'New' })]);
  });

  it('覆盖时一次生成包含目标文件夹的最终记录', () => {
    const plan = buildSavedTableBatchImportPlan(
      {
        items: [{ name: ' demo ', state: createState('updated') }],
        conflictStrategy: 'overwrite',
        folderId: 'folder-1',
      },
      [createRecord('demo', 'Demo')],
      100,
    );

    expect(plan.records).toEqual([
      expect.objectContaining({
        normalizedName: 'demo',
        name: 'Demo',
        folderId: 'folder-1',
        createdAt: 10,
        updatedAt: 100,
        state: expect.objectContaining({ tableName: 'updated' }),
      }),
    ]);
  });

  it('重命名时避开活动记录和回收站记录', () => {
    const plan = buildSavedTableBatchImportPlan(
      {
        items: [{ name: 'Demo', state: createState('renamed') }],
        conflictStrategy: 'rename',
      },
      [createRecord('demo', 'Demo'), createRecord('demo_1', 'Demo_1', { trashedAt: 30 })],
      100,
    );

    expect(plan.records[0]).toEqual(
      expect.objectContaining({ normalizedName: 'demo_2', name: 'Demo_2' }),
    );
  });

  it('同名记录在回收站时直接恢复并清除回收站状态', () => {
    const plan = buildSavedTableBatchImportPlan(
      {
        items: [{ name: 'Archived', state: createState('restored') }],
        conflictStrategy: 'skip',
        folderId: 'folder-2',
      },
      [createRecord('archived', 'Archived', { trashedAt: 30 })],
      100,
    );

    expect(plan.successCount).toBe(1);
    expect(plan.records[0]).toEqual(
      expect.objectContaining({
        normalizedName: 'archived',
        folderId: 'folder-2',
        createdAt: 10,
      }),
    );
    expect(plan.records[0]).not.toHaveProperty('trashedAt');
  });
});
