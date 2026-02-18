import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildGlobalDraftSummary,
  isSameWorkspaceSource,
  isWorkspaceSource,
  normalizeGlobalDraftRecord,
  normalizePersistedState,
  normalizeWorkspaceSession,
} from '@/hooks/workspacePersistence/normalize';

describe('workspacePersistence/normalize', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizePersistedState 对非法输入应返回 null', () => {
    expect(normalizePersistedState(null)).toBeNull();
    expect(normalizePersistedState('x')).toBeNull();
    expect(normalizePersistedState([])).toBeNull();
  });

  it('normalizePersistedState 应应用默认值并过滤非法项', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

    const result = normalizePersistedState({
      tableName: 1,
      tableComment: null,
      dbType: 42,
      rows: [
        {
          order: 'x',
          fieldName: 123,
          fieldType: null,
          fieldComment: undefined,
          nullable: '否',
          defaultKind: 1,
          defaultValue: 99,
          onUpdate: null,
        },
        'invalid-row',
      ],
      addCount: 'x',
      indexInput: 1,
      currentIndexFields: [
        { name: 'id', direction: 'DESC' },
        { name: '', direction: 'ASC' },
        null,
      ],
      indexes: [
        {
          id: 1,
          name: 'idx_users_id',
          fields: [
            { name: 'id', direction: 'DESC' },
            { name: '', direction: 'ASC' },
            null,
          ],
          unique: true,
          isPrimary: false,
        },
        { id: 'x', name: '', fields: [] },
        1,
      ],
      authInput: null,
      authObjects: ['u1', 1, 'u2'],
      citusShardingConfig: { mode: 'reference' },
      mysqlPartitionConfig: { enabled: true },
      tableMiscConfig: { enabled: true },
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    } as any);

    expect(result).not.toBeNull();
    expect(result).toMatchObject({
      tableName: '',
      tableComment: '',
      dbType: 'mysql',
      addCount: 10,
      indexInput: '',
      authInput: '',
      authObjects: ['u1', 'u2'],
      citusShardingConfig: { mode: 'reference' },
      mysqlPartitionConfig: { enabled: true },
      tableMiscConfig: { enabled: true },
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    });

    expect(result?.rows).toEqual([
      {
        order: 1,
        fieldName: '',
        fieldType: '',
        fieldComment: '',
        nullable: '否',
        defaultKind: '无',
        defaultValue: '',
        onUpdate: '无',
      },
      {
        order: 2,
        fieldName: '',
        fieldType: '',
        fieldComment: '',
        nullable: '是',
        defaultKind: '无',
        defaultValue: '',
        onUpdate: '无',
      },
    ]);

    expect(result?.currentIndexFields).toEqual([
      { name: 'id', direction: 'DESC' },
    ]);
    expect(result?.indexes).toHaveLength(1);
    expect(result?.indexes[0].name).toBe('idx_users_id');
    expect(result?.indexes[0].id).toContain('idx_1700000000000_');
    expect(result?.indexes[0].fields).toEqual([
      { name: 'id', direction: 'DESC' },
    ]);
  });

  it('isWorkspaceSource 应正确识别来源类型', () => {
    expect(isWorkspaceSource({ kind: 'global_draft' })).toBe(true);
    expect(
      isWorkspaceSource({
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: 'sig',
      }),
    ).toBe(true);

    expect(isWorkspaceSource({ kind: 'saved_table', tableName: 'Users' })).toBe(
      false,
    );
    expect(isWorkspaceSource({ kind: 'other' })).toBe(false);
    expect(isWorkspaceSource(null)).toBe(false);
  });

  it('isSameWorkspaceSource 应比较来源是否一致', () => {
    const globalA = { kind: 'global_draft' } as const;
    const globalB = { kind: 'global_draft' } as const;

    const savedA = {
      kind: 'saved_table' as const,
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: 'sig-a',
    };
    const savedB = {
      kind: 'saved_table' as const,
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: 'sig-a',
    };
    const savedC = {
      kind: 'saved_table' as const,
      normalizedName: 'users',
      tableName: 'Users',
      baseSignature: 'sig-c',
    };

    expect(isSameWorkspaceSource(globalA, globalB)).toBe(true);
    expect(isSameWorkspaceSource(savedA, savedB)).toBe(true);
    expect(isSameWorkspaceSource(savedA, savedC)).toBe(false);
    expect(isSameWorkspaceSource(globalA, savedA)).toBe(false);
  });

  it('buildGlobalDraftSummary 应统计字段并处理空表名', () => {
    const summary = buildGlobalDraftSummary(
      {
        tableName: '   ',
        tableComment: '',
        dbType: 'mysql',
        rows: [
          {
            order: 1,
            fieldName: 'id',
            fieldType: 'int',
            fieldComment: '',
            nullable: '否',
            defaultKind: '无',
            defaultValue: '',
            onUpdate: '无',
          },
          {
            order: 2,
            fieldName: '   ',
            fieldType: 'varchar(20)',
            fieldComment: '',
            nullable: '是',
            defaultKind: '无',
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
      },
      123,
    );

    expect(summary).toEqual({
      name: '未命名草稿',
      dbType: 'mysql',
      fieldCount: 1,
      updatedAt: 123,
    });
  });

  it('normalizeGlobalDraftRecord 应校验 state 并处理默认 updatedAt', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234567890);

    const valid = normalizeGlobalDraftRecord({
      updatedAt: 'x',
      state: {
        tableName: 'users',
        tableComment: '',
        dbType: 'mysql',
        rows: [],
        addCount: 10,
        indexInput: '',
        currentIndexFields: [],
        indexes: [],
        authInput: '',
        authObjects: [],
      },
    });

    expect(valid?.updatedAt).toBe(1234567890);
    expect(valid?.state.tableName).toBe('users');

    expect(normalizeGlobalDraftRecord({ state: null })).toBeNull();
    expect(normalizeGlobalDraftRecord('x')).toBeNull();
  });

  it('normalizeWorkspaceSession 应校验 activeSource 并规范 activeState', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2222);

    const session = normalizeWorkspaceSession({
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: 'sig',
      },
      activeState: {
        tableName: 'users',
        tableComment: '',
        dbType: 'mysql',
        rows: [],
        addCount: 10,
        indexInput: '',
        currentIndexFields: [],
        indexes: [],
        authInput: '',
        authObjects: ['u1', 1],
      },
      updatedAt: 'bad',
    });

    expect(session).not.toBeNull();
    expect(session?.updatedAt).toBe(2222);
    expect(session?.activeSource.kind).toBe('saved_table');
    expect(session?.activeState?.authObjects).toEqual(['u1']);

    expect(
      normalizeWorkspaceSession({ activeSource: { kind: 'x' } }),
    ).toBeNull();
    expect(normalizeWorkspaceSession(null)).toBeNull();
  });
});
