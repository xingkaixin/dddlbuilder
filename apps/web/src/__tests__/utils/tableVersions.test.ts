import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createVersion, listVersions, pruneOldVersions } from '@/utils/tableVersions';
import type { PersistedState } from '@ddlbuilder/shared-types';
import { setupFakeIndexedDB, teardownFakeIndexedDB } from './fakeIndexedDb';

function createMockState(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    schemaName: '',
    tableName: 'test_table',
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    rows: [
      {
        id: 'field-1',
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

  beforeAll(() => {
    setupFakeIndexedDB();
  });

  afterAll(() => {
    teardownFakeIndexedDB();
  });

  it('同名表在不同工作区中互不影响', async () => {
    const normalizedName = getTestTableName().normalizedName;

    const anonymousTarget = {
      scope: { kind: 'anonymous' } as const,
      tableId: 'shared-id',
      normalizedName,
    };
    const userTarget = {
      scope: {
        kind: 'user' as const,
        userId: 'user-1',
        workspaceId: 'workspace-1',
      },
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
});
