import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createVersion,
  listVersions,
  listVersionMetadata,
  getVersion,
  deleteVersion,
  deleteAllVersions,
  pruneOldVersions,
  countVersions,
} from '@/utils/tableVersions';
import type { PersistedState } from '@/types';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';

function createMockState(
  overrides: Partial<PersistedState> = {},
): PersistedState {
  return {
    tableName: 'test_table',
    tableComment: '',
    dbType: 'mysql',
    rows: [
      {
        order: 1,
        fieldName: 'id',
        fieldType: 'BIGINT',
        fieldComment: '',
        nullable: '否',
        defaultKind: '自增',
        defaultValue: '',
        onUpdate: '无',
      },
    ],
    addCount: 10,
    indexInput: '',
    currentIndexFields: [],
    indexes: [],
    authInput: '',
    authObjects: [],
    ...overrides,
  };
}

describe('tableVersions', () => {
  let testId = 0;
  const getTestTableName = () => `test_table_${Date.now()}_${testId++}`;

  beforeAll(() => {
    setupFakeIndexedDB();
  });

  afterAll(() => {
    teardownFakeIndexedDB();
  });

  describe('createVersion', () => {
    it('创建版本快照', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      const version = await createVersion(testTableName, state, '初始版本');

      expect(version.id).toBeDefined();
      expect(version.tableNormalizedName).toBe(testTableName);
      expect(version.state).toEqual(state);
      expect(version.message).toBe('初始版本');
      expect(version.createdAt).toBeGreaterThan(0);
    });
  });

  describe('listVersions', () => {
    it('按时间倒序返回版本列表', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      await createVersion(testTableName, state, 'v1');
      await new Promise((r) => setTimeout(r, 10));
      await createVersion(testTableName, state, 'v2');

      const versions = await listVersions(testTableName);
      expect(versions.length).toBe(2);
      expect(versions[0].message).toBe('v2');
      expect(versions[1].message).toBe('v1');
    });

    it('空表返回空数组', async () => {
      const testTableName = getTestTableName();
      const versions = await listVersions(testTableName);
      expect(versions).toEqual([]);
    });
  });

  describe('listVersionMetadata', () => {
    it('返回轻量级元数据', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      await createVersion(testTableName, state, 'test');

      const metadata = await listVersionMetadata(testTableName);
      expect(metadata.length).toBe(1);
      expect(metadata[0].dbType).toBe('mysql');
      expect(metadata[0].fieldCount).toBe(1);
      expect(metadata[0].message).toBe('test');
    });

    it('字段统计应忽略空白字段名', async () => {
      const testTableName = getTestTableName();
      const state = createMockState({
        rows: [
          {
            order: 1,
            fieldName: 'id',
            fieldType: 'BIGINT',
            fieldComment: '',
            nullable: '否',
            defaultKind: '自增',
            defaultValue: '',
            onUpdate: '无',
          },
          {
            order: 2,
            fieldName: '   ',
            fieldType: 'VARCHAR(50)',
            fieldComment: '',
            nullable: '是',
            defaultKind: '无',
            defaultValue: '',
            onUpdate: '无',
          },
        ],
      });

      await createVersion(testTableName, state, 'with-empty-field');
      const metadata = await listVersionMetadata(testTableName);

      expect(metadata).toHaveLength(1);
      expect(metadata[0].fieldCount).toBe(1);
    });

    it('rows 缺失时 fieldCount 应回退为 0', async () => {
      const testTableName = getTestTableName();
      const state = createMockState({
        rows: undefined as unknown as PersistedState['rows'],
      });

      await createVersion(testTableName, state, 'rows-missing');
      const metadata = await listVersionMetadata(testTableName);

      expect(metadata).toHaveLength(1);
      expect(metadata[0].fieldCount).toBe(0);
    });
  });

  describe('getVersion', () => {
    it('获取单个版本', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      const created = await createVersion(testTableName, state);

      const fetched = await getVersion(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
    });

    it('不存在返回 null', async () => {
      const result = await getVersion('non_existent_id');
      expect(result).toBeNull();
    });
  });

  describe('deleteVersion', () => {
    it('删除版本', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      const version = await createVersion(testTableName, state);

      await deleteVersion(version.id);
      const result = await getVersion(version.id);
      expect(result).toBeNull();
    });
  });

  describe('deleteAllVersions', () => {
    it('删除指定表的全部版本', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();

      await createVersion(testTableName, state, 'v1');
      await createVersion(testTableName, state, 'v2');

      await deleteAllVersions(testTableName);

      const versions = await listVersions(testTableName);
      expect(versions).toEqual([]);
      expect(await countVersions(testTableName)).toBe(0);
    });
  });

  describe('pruneOldVersions', () => {
    it('清理超限版本', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();

      // 创建 3 个版本
      await createVersion(testTableName, state, 'v1');
      await new Promise((r) => setTimeout(r, 5));
      await createVersion(testTableName, state, 'v2');
      await new Promise((r) => setTimeout(r, 5));
      await createVersion(testTableName, state, 'v3');

      // 保留最新 1 个
      const deleted = await pruneOldVersions(testTableName, 1);
      expect(deleted).toBe(2);

      const remaining = await listVersions(testTableName);
      expect(remaining.length).toBe(1);
      expect(remaining[0].message).toBe('v3');
    });

    it('不超限时不删除', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      await createVersion(testTableName, state);

      const deleted = await pruneOldVersions(testTableName, 10);
      expect(deleted).toBe(0);
    });
  });

  describe('countVersions', () => {
    it('返回版本数量', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      await createVersion(testTableName, state);
      await createVersion(testTableName, state);

      const count = await countVersions(testTableName);
      expect(count).toBe(2);
    });
  });
});
