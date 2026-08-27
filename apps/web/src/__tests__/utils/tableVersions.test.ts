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
  const getTestTableName = () => {
    const normalizedName = `test_table_${Date.now()}_${testId++}`;
    return { scope: { kind: 'anonymous' } as const, tableId: normalizedName, normalizedName };
  };
  const defaultTarget = {
    scope: { kind: 'anonymous' } as const,
    tableId: 'test',
    normalizedName: 'test',
  };

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
      expect(version.tableNormalizedName).toBe(testTableName.normalizedName);
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

    it('同名表在不同工作区中互不影响', async () => {
      const normalizedName = getTestTableName().normalizedName;
      const anonymousTarget = {
        scope: { kind: 'anonymous' } as const,
        tableId: 'shared-id',
        normalizedName,
      };
      const userTarget = {
        scope: { kind: 'user' } as const,
        userId: 'user-1',
        workspaceId: 'workspace-1',
        tableId: 'shared-id',
        normalizedName,
      };

      await createVersion(anonymousTarget, createMockState(), 'anonymous');
      await createVersion(userTarget, createMockState(), 'user');

      expect((await listVersions(anonymousTarget)).map((version) => version.message)).toEqual([
        'anonymous',
      ]);
      expect((await listVersions(userTarget)).map((version) => version.message)).toEqual(['user']);
    });

    it('表重命名后仍通过稳定 ID 读取原有历史', async () => {
      const originalTarget = getTestTableName();
      await createVersion(originalTarget, createMockState(), 'before-rename');
      const renamedTarget = {
        ...originalTarget,
        normalizedName: `${originalTarget.normalizedName}_v2`,
      };

      const versions = await listVersions(renamedTarget);

      expect(versions.map((version) => version.message)).toEqual(['before-rename']);
    });

    it('首次读取时接管旧版未分区历史', async () => {
      const target = getTestTableName();
      const competingTarget = {
        scope: {
          kind: 'user' as const,
          userId: 'legacy-user',
          workspaceId: 'legacy-workspace',
        },
        tableId: `${target.tableId}-competing`,
        normalizedName: target.normalizedName,
      };
      const db = await dbUtils.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(dbUtils.VERSION_STORE_NAME, 'readwrite');
        tx.objectStore(dbUtils.VERSION_STORE_NAME).add({
          id: `legacy-${target.tableId}`,
          tableNormalizedName: target.normalizedName,
          state: createMockState(),
          message: 'legacy',
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      const [version] = await listVersions(target);

      expect(version.message).toBe('legacy');
      expect(version.tableId).toBe(target.tableId);
      expect(version.tableKey).toBe(`anonymous::${target.tableId}`);
      expect(await listVersions(competingTarget)).toEqual([]);
    });

    it('通过 ID 读取旧版本时也会固定归属', async () => {
      const target = getTestTableName();
      const versionId = `legacy-by-id-${target.tableId}`;
      const db = await dbUtils.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(dbUtils.VERSION_STORE_NAME, 'readwrite');
        tx.objectStore(dbUtils.VERSION_STORE_NAME).add({
          id: versionId,
          tableNormalizedName: target.normalizedName,
          state: createMockState(),
          message: 'legacy-by-id',
          createdAt: Date.now(),
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      const version = await getVersion(versionId, target);

      expect(version?.tableKey).toBe(`anonymous::${target.tableId}`);
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

      const fetched = await getVersion(created.id, testTableName);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
    });

    it('不存在返回 null', async () => {
      const result = await getVersion('non_existent_id', defaultTarget);
      expect(result).toBeNull();
    });
  });

  describe('deleteVersion', () => {
    it('删除版本', async () => {
      const testTableName = getTestTableName();
      const state = createMockState();
      const version = await createVersion(testTableName, state);

      await deleteVersion(version.id, testTableName);
      const result = await getVersion(version.id, testTableName);
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

      const p1 = getVersion('1', defaultTarget);
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

      const p2 = getVersion('1', defaultTarget);
      await Promise.resolve();
      mockTx.onerror();
      await expect(p2).rejects.toThrow('事务失败');

      vi.restoreAllMocks();
    });

    it('propagates version history transaction failures', async () => {
      let mockTx: any;
      const mockRequest = { onerror: null, onsuccess: null };
      const mockDb = {
        transaction: () => mockTx,
        close: vi.fn(),
      };
      vi.spyOn(dbUtils, 'openDb').mockResolvedValue(mockDb as unknown as IDBDatabase);

      mockTx = {
        objectStore: () => ({ index: () => ({ getAll: () => mockRequest }) }),
        onerror: null,
        onabort: null,
        oncomplete: null,
        error: new Error('list error'),
      };
      const failedRead = listVersions(defaultTarget);
      await Promise.resolve();
      mockTx.onerror();
      await expect(failedRead).rejects.toThrow('list error');

      mockTx = {
        objectStore: () => ({ index: () => ({ getAll: () => mockRequest }) }),
        onerror: null,
        onabort: null,
        oncomplete: null,
        error: null,
      };
      const abortedRead = listVersions(defaultTarget);
      await Promise.resolve();
      mockTx.onabort();
      await expect(abortedRead).rejects.toThrow('IndexedDB 事务被中止');

      vi.restoreAllMocks();
    });
  });
});
