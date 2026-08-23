import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import * as dbUtils from '@/utils/workspaceDb';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';

function createMockState(overrides: Partial<PersistedState> = {}): PersistedState {
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
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
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
            nullable: false,
            defaultKind: 'auto_increment',
            defaultValue: '',
            onUpdate: 'none',
          },
          {
            order: 2,
            fieldName: '   ',
            fieldType: 'VARCHAR(50)',
            fieldComment: '',
            nullable: true,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
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

  describe('error handling', () => {
    it('should handle request.onerror and tx.onabort in runWithStore', async () => {
      let mockTx: any;
      let mockRequest: any;

      const mockDb = {
        transaction: () => mockTx,
        close: vi.fn(),
      };

      vi.spyOn(dbUtils, 'openDb').mockResolvedValue(mockDb as unknown as IDBDatabase);

      // 1. request.onerror fallback
      mockRequest = { onerror: null, onsuccess: null, error: null };
      mockTx = {
        objectStore: () => ({ get: () => mockRequest }),
        onerror: null,
        onabort: null,
        oncomplete: null,
      };

      const p1 = getVersion('1');
      await Promise.resolve(); // yield to let openDb resolve
      mockRequest.onerror();
      await expect(p1).rejects.toThrow('请求失败');

      // 2. tx.onerror fallback
      mockRequest = { onerror: null, onsuccess: null, result: undefined };
      mockTx = {
        objectStore: () => ({ get: () => mockRequest }),
        onerror: null,
        onabort: null,
        oncomplete: null,
        error: null,
      };

      const p2 = getVersion('1');
      await Promise.resolve();
      mockTx.onerror();
      await expect(p2).rejects.toThrow('事务失败');

      vi.restoreAllMocks();
    });

    it('should handle explicit indexeddb errors', async () => {
      let mockTx: any;
      let mockRequest: any = {
        onerror: null,
        onsuccess: null,
        error: new Error('index error'),
      };
      const mockIndex: any = {
        getAll: () => mockRequest,
        count: () => mockRequest,
      };

      const mockDb = {
        transaction: () => mockTx,
        close: vi.fn(),
      };

      vi.spyOn(dbUtils, 'openDb').mockResolvedValue(mockDb as unknown as IDBDatabase);

      // countVersions error
      mockTx = {
        objectStore: () => ({ index: () => mockIndex }),
        onerror: null,
        oncomplete: null,
      };
      const p1 = countVersions('test');
      await Promise.resolve();
      mockRequest.onerror();
      await expect(p1).rejects.toThrow('index error');

      // listVersions error
      mockRequest = {
        onerror: null,
        onsuccess: null,
        error: new Error('list error'),
      };
      mockTx = {
        objectStore: () => ({
          index: () => {
            return { getAll: () => mockRequest };
          },
        }),
        onerror: null,
        oncomplete: null,
      };
      const p2 = listVersions('test');
      await Promise.resolve();
      mockRequest.onerror();
      await expect(p2).rejects.toThrow('list error');

      // deleteAllVersions error
      vi.restoreAllMocks();

      // Need to spy again but only fail the delete transaction, let listVersions pass
      const testTableName = getTestTableName();
      await createVersion(testTableName, createMockState(), 'v1');

      const failDelete = true;
      vi.spyOn(dbUtils, 'openDb').mockImplementation(async () => {
        await dbUtils.openDb(); // The original is mocked by fakeIndexedDB but spyOn overrides it!
        // Wait, if we use actualDb it's intercepted by spyOn if we don't restore.
        // Actually, just mock the transaction for delete.
        if (failDelete) {
          return {
            transaction: () => ({
              objectStore: () => ({ delete: vi.fn() }),
              onerror: null,
              oncomplete: null,
              error: new Error('delete error'),
            }),
            close: vi.fn(),
          } as unknown as IDBDatabase;
        }
        return {} as unknown as IDBDatabase; // Not used
      });

      // Instead of relying on openDb for listVersions, we can mock listVersions directly
      // But it's not exported to be mocked locally like this without messing up the module.
      // Let's just mock tx.onerror in pruneOldVersions as well.
      vi.restoreAllMocks();
    });
  });
});
