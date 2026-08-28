import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnumValueMeta } from '@ddlbuilder/shared-types';
import {
  buildDraftSummary,
  getDraftDisplayName,
  isSameWorkspaceSelection,
  isSameWorkspaceSource,
  isWorkspaceSource,
  normalizePersistedState,
  normalizeWorkspaceSession,
  resolveUniqueDraftName,
  UNTITLED_DRAFT_NAME,
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
      currentIndexFields: [{ name: 'id', direction: 'DESC' }, { name: '', direction: 'ASC' }, null],
      indexes: [
        {
          id: 1,
          name: 'idx_users_id',
          fields: [{ name: 'id', direction: 'DESC' }, { name: '', direction: 'ASC' }, null],
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
      schemaName: '',
      tableName: '',
      tableComment: '',
      dbType: 'mysql',
      sqlFormatMode: 'compact',
      addCount: 10,
      indexInput: '',
      authInput: '',
      authObjects: ['u1', 'u2'],
      citusShardingConfig: { mode: 'reference' },
      tableMiscConfig: { enabled: true },
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
    });

    expect(result?.rows).toEqual([
      {
        id: 'legacy-field-0',
        fieldName: '',
        fieldType: '',
        fieldComment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
      {
        id: 'legacy-field-1',
        fieldName: '',
        fieldType: '',
        fieldComment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ]);

    expect(result?.currentIndexFields).toEqual([{ name: 'id', direction: 'DESC' }]);
    expect(result?.indexes).toHaveLength(1);
    expect(result?.indexes[0].name).toBe('idx_users_id');
    expect(result?.indexes[0].id).toBe('legacy-index-0');
    expect(result?.indexes[0].fields).toEqual([{ name: 'id', direction: 'DESC' }]);
  });

  it('normalizePersistedState 应保留 enumMeta', () => {
    const enumMeta: EnumValueMeta[] = [
      { value: '0', i18n: { 'zh-CN': '删除' }, color: '#ff0000' },
      { value: '1', i18n: { 'zh-CN': '正常' }, color: '#00ff00' },
    ];
    const result = normalizePersistedState({
      tableName: 't1',
      dbType: 'mysql',
      rows: [
        {
          id: 'field-status',
          order: 1,
          fieldName: 'status',
          fieldType: 'char(1)',
          nullable: '是',
          enumMeta,
        },
        {
          id: 'field-type',
          order: 2,
          fieldName: 'type',
          fieldType: 'int',
          nullable: '是',
          enumMeta: 'not-array',
        },
      ],
      addCount: 10,
      indexInput: '',
      currentIndexFields: [],
      indexes: [],
      authInput: '',
      authObjects: [],
    });

    expect(result).not.toBeNull();
    expect(result?.rows[0].enumMeta).toEqual(enumMeta);
    expect(result?.rows[1].enumMeta).toBeUndefined();
  });

  it('normalizePersistedState 应兼容旧的 schema.tableName 格式', () => {
    const result = normalizePersistedState({
      tableName: 'public.users',
      tableComment: '',
      dbType: 'postgresql',
      rows: [],
      addCount: 10,
      indexInput: '',
      currentIndexFields: [],
      indexes: [],
      authInput: '',
      authObjects: [],
      sqlFormatMode: 'aligned',
    });

    expect(result?.schemaName).toBe('public');
    expect(result?.tableName).toBe('users');
    expect(result?.sqlFormatMode).toBe('aligned');
  });

  it('isWorkspaceSource 应正确识别来源类型', () => {
    expect(isWorkspaceSource({ kind: 'draft', draftId: 'default' })).toBe(true);
    expect(
      isWorkspaceSource({
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: 'sig',
      }),
    ).toBe(true);

    expect(isWorkspaceSource({ kind: 'saved_table', tableName: 'Users' })).toBe(false);
    expect(isWorkspaceSource({ kind: 'other' })).toBe(false);
    expect(isWorkspaceSource(null)).toBe(false);
  });

  it('isSameWorkspaceSource 应比较来源是否一致', () => {
    const globalA = { kind: 'draft', draftId: 'default' } as const;
    const globalB = { kind: 'draft', draftId: 'default' } as const;

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
    expect(isSameWorkspaceSource(savedA, savedC)).toBe(true);
    expect(isSameWorkspaceSelection(savedA, savedC)).toBe(false);
    expect(isSameWorkspaceSource(globalA, savedA)).toBe(false);
  });

  it('buildDraftSummary 应统计字段并处理空表名', () => {
    const summary = buildDraftSummary(
      'default',
      {
        schemaName: '',
        tableName: '   ',
        tableComment: '',
        dbType: 'mysql',
        rows: [
          {
            id: 'field-id',
            order: 1,
            fieldName: 'id',
            fieldType: 'int',
            fieldComment: '',
            nullable: false,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
          },
          {
            id: 'field-   ',
            order: 2,
            fieldName: '   ',
            fieldType: 'varchar(20)',
            fieldComment: '',
            nullable: true,
            defaultKind: 'none',
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
      },
      123,
      456,
    );

    expect(summary).toEqual({
      draftId: 'default',
      name: '未命名草稿',
      dbType: 'mysql',
      fieldCount: 1,
      createdAt: 123,
      updatedAt: 456,
    });
  });

  it('normalizeWorkspaceSession 应校验 activeSource 并忽略历史内容副本', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2222);

    const session = normalizeWorkspaceSession({
      activeSource: {
        kind: 'saved_table',
        normalizedName: 'users',
        tableName: 'Users',
        baseSignature: 'sig',
      },
      activeState: {
        schemaName: '',
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
    expect(session).not.toHaveProperty('activeState');

    expect(normalizeWorkspaceSession({ activeSource: { kind: 'x' } })).toBeNull();
    expect(normalizeWorkspaceSession(null)).toBeNull();
  });

  it('resolveUniqueDraftName 应在冲突时追加自增后缀', () => {
    expect(resolveUniqueDraftName('users', new Set())).toBe('users');
    expect(resolveUniqueDraftName('users', new Set(['other']))).toBe('users');
    expect(resolveUniqueDraftName('users', new Set(['users']))).toBe('users_1');
    expect(resolveUniqueDraftName('users', new Set(['users', 'users_1', 'users_2']))).toBe(
      'users_3',
    );
  });

  it('getDraftDisplayName 应在表名为空时回落到默认草稿名', () => {
    const state = normalizePersistedState({ tableName: '   ' });
    expect(state && getDraftDisplayName(state)).toBe(UNTITLED_DRAFT_NAME);
  });
});
