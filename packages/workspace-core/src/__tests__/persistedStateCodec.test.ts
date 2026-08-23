import { describe, expect, it } from 'vitest';
import { decodePersistedState, decodeWorkspaceSnapshot } from '../persistedStateCodec';

const externalState = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

const completeSnapshot = () => ({
  globalDraft: null,
  drafts: [
    {
      draftId: 'draft-1',
      state: externalState(),
      createdAt: 1,
      updatedAt: 2,
      folderId: 'folder-1',
    },
  ],
  savedTables: [
    {
      normalizedName: 'public.users',
      name: 'users',
      state: externalState(),
      createdAt: 3,
      updatedAt: 4,
      folderId: 'folder-1',
    },
  ],
  savedDrafts: [
    {
      normalizedName: 'public.users',
      tableName: 'users',
      baseSignature: 'signature',
      state: externalState(),
      updatedAt: 5,
    },
  ],
  folders: [
    {
      id: 'folder-1',
      name: 'Folder',
      parentId: 'parent-1',
      order: 0,
      createdAt: 6,
    },
  ],
});

describe('decodePersistedState', () => {
  it('兼容旧的限定表名并稳定补齐实体 id', () => {
    const input = {
      ...externalState(),
      tableName: 'analytics.users',
      rows: [{ fieldName: 'id', fieldType: 'bigint', nullable: '否' }],
      indexes: [{ name: 'idx_users_id', fields: [{ name: 'id' }] }],
      foreignKeys: [
        {
          name: 'fk_users_team',
          fields: ['team_id'],
          refTable: 'teams',
          refFields: ['id'],
        },
      ],
    };

    const first = decodePersistedState(input);
    const second = decodePersistedState(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      schemaName: 'analytics',
      tableName: 'users',
      rows: [{ id: 'legacy-field-0', nullable: false }],
      indexes: [{ id: 'legacy-index-0' }],
      foreignKeys: [{ id: 'legacy-foreign-key-0' }],
    });
  });

  it('兼容模式修复未知数据库类型，外部模式拒绝不完整或未知输入', () => {
    expect(decodePersistedState({ tableName: 'users', dbType: 'unknown' })?.dbType).toBe('mysql');
    expect(decodePersistedState({}, 'external')).toBeNull();
    expect(decodePersistedState({ ...externalState(), dbType: 'unknown' }, 'external')).toBeNull();
    expect(decodePersistedState(null)).toBeNull();
    expect(decodePersistedState([])).toBeNull();
  });

  it('只保留结构和取值合法的嵌套配置', () => {
    const decoded = decodePersistedState({
      ...externalState(),
      citusShardingConfig: { mode: 'invalid', distributionColumn: 1 },
      mysqlPartitionConfig: { enabled: true },
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: '2' },
      foreignKeys: [{ name: 'broken' }],
    });

    expect(decoded?.citusShardingConfig).toBeUndefined();
    expect(decoded?.mysqlPartitionConfig).toBeUndefined();
    expect(decoded?.fieldTableViewConfig).toEqual({ freezeEnabled: true, freezeColumns: 0 });
    expect(decoded?.foreignKeys).toEqual([]);
  });

  it('规范化完整的表、字段、索引、外键和数据库配置', () => {
    const decoded = decodePersistedState(
      externalState({
        objectType: 'view',
        schemaName: 'analytics',
        tableComment: 'Users',
        dbType: 'postgresql-citus',
        sqlFormatMode: 'aligned',
        viewDefinition: 'select 1',
        viewCreateOrReplace: true,
        rows: [
          {
            id: 'field-1',
            fieldName: 'id',
            fieldType: 'bigint',
            fieldComment: 'ID',
            nullable: true,
            defaultKind: 'literal',
            defaultValue: '1',
            onUpdate: 'CURRENT_TIMESTAMP',
            enumMeta: [{ value: '1', label: 'one' }],
          },
          'invalid-row',
        ],
        addCount: 20,
        indexInput: 'idx_users_id',
        currentIndexFields: [
          { name: 'id', direction: 'DESC' },
          { name: '', direction: 'ASC' },
          null,
        ],
        indexes: [
          {
            id: 'index-1',
            name: 'idx_users_id',
            fields: [{ name: 'id', direction: 'DESC' }],
            unique: true,
            isPrimary: true,
          },
          { name: '' },
          null,
        ],
        authInput: 'reader',
        authObjects: ['reader', 1],
        citusShardingConfig: { mode: 'distributed', distributionColumn: 'tenant_id' },
        mysqlPartitionConfig: {
          enabled: true,
          type: 'RANGE',
          columns: ['created_at', 1],
          expression: 'YEAR(created_at)',
          partitionCount: 4,
          partitions: [{ name: 'p0', value: '2025' }, { name: 'broken' }, null],
        },
        tableMiscConfig: {
          enabled: true,
          engine: 'InnoDB',
          charset: 'utf8mb4',
          collation: 'utf8mb4_bin',
          tablespace: 'userspace',
          fillfactor: 80,
          pctfree: 10,
          initrans: 2,
          storedAs: 'PARQUET',
          external: true,
          location: '/warehouse/users',
          partitions: {
            enabled: true,
            columns: [
              { name: 'day', type: 'STRING', comment: 'Partition day' },
              { name: 'broken' },
              null,
            ],
            clustering: {
              enabled: true,
              columns: ['tenant_id', 1],
              bucketCount: 8,
            },
          },
        },
        fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
        foreignKeys: [
          {
            id: 'foreign-key-1',
            name: 'fk_users_team',
            fields: ['team_id', 1],
            refSchema: 'public',
            refTable: 'teams',
            refFields: ['id', 1],
            onDelete: 'CASCADE',
            onUpdate: 'RESTRICT',
          },
          {
            name: 'fk_users_org',
            refTable: 'organizations',
            onDelete: 'INVALID',
            onUpdate: 'INVALID',
          },
          null,
        ],
      }),
    );

    expect(decoded).toMatchObject({
      objectType: 'view',
      schemaName: 'analytics',
      tableName: 'users',
      dbType: 'postgresql-citus',
      sqlFormatMode: 'aligned',
      viewDefinition: 'select 1',
      viewCreateOrReplace: true,
      rows: [
        { id: 'field-1', fieldName: 'id', enumMeta: [{ value: '1', label: 'one' }] },
        { id: 'legacy-field-1', fieldName: '' },
      ],
      currentIndexFields: [{ name: 'id', direction: 'DESC' }],
      indexes: [{ id: 'index-1', name: 'idx_users_id', unique: true, isPrimary: true }],
      authObjects: ['reader'],
      citusShardingConfig: { mode: 'distributed', distributionColumn: 'tenant_id' },
      mysqlPartitionConfig: {
        enabled: true,
        type: 'RANGE',
        columns: ['created_at'],
        expression: 'YEAR(created_at)',
        partitionCount: 4,
        partitions: [{ name: 'p0', value: '2025' }],
      },
      tableMiscConfig: {
        enabled: true,
        storedAs: 'PARQUET',
        external: true,
        partitions: {
          enabled: true,
          columns: [{ name: 'day', type: 'STRING', comment: 'Partition day' }],
          clustering: { enabled: true, columns: ['tenant_id'], bucketCount: 8 },
        },
      },
      fieldTableViewConfig: { freezeEnabled: true, freezeColumns: 2 },
      foreignKeys: [
        {
          id: 'foreign-key-1',
          fields: ['team_id'],
          refSchema: 'public',
          refFields: ['id'],
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT',
        },
        {
          id: 'legacy-foreign-key-1',
          fields: [],
          refFields: [],
        },
      ],
    });
  });

  it('省略类型不匹配的可选配置值', () => {
    const decoded = decodePersistedState(
      externalState({
        objectType: 'routine',
        viewDefinition: 1,
        viewCreateOrReplace: 'yes',
        addCount: Number.NaN,
        citusShardingConfig: { mode: 'reference', distributionColumn: 1 },
        mysqlPartitionConfig: {
          enabled: false,
          type: 'HASH',
          columns: null,
          expression: 1,
          partitionCount: Number.NaN,
        },
        tableMiscConfig: {
          enabled: false,
          engine: 1,
          charset: 1,
          collation: 1,
          tablespace: 1,
          fillfactor: Number.NaN,
          pctfree: Number.NaN,
          initrans: Number.NaN,
          storedAs: 'CSV',
          external: 'yes',
          location: 1,
          partitions: { enabled: false, columns: null, clustering: 'invalid' },
        },
      }),
    );

    expect(decoded).not.toHaveProperty('objectType');
    expect(decoded).not.toHaveProperty('viewDefinition');
    expect(decoded).not.toHaveProperty('viewCreateOrReplace');
    expect(decoded?.addCount).toBe(10);
    expect(decoded?.citusShardingConfig).toEqual({ mode: 'reference' });
    expect(decoded?.mysqlPartitionConfig).toEqual({
      enabled: false,
      type: 'HASH',
      columns: [],
    });
    expect(decoded?.tableMiscConfig).toEqual({
      enabled: false,
      partitions: { enabled: false, columns: [] },
    });
  });

  it('处理退化的限定表名', () => {
    expect(decodePersistedState(externalState({ tableName: '.' }))).toMatchObject({
      schemaName: '',
      tableName: '.',
    });
  });

  it.each([
    ['tableName', 1],
    ['tableComment', 1],
    ['dbType', 'unknown'],
    ['rows', null],
    ['addCount', '10'],
    ['addCount', Number.NaN],
    ['indexInput', 1],
    ['currentIndexFields', null],
    ['indexes', null],
    ['authInput', 1],
    ['authObjects', null],
  ])('外部模式拒绝 %s 非法的状态', (property, value) => {
    expect(decodePersistedState(externalState({ [property]: value }), 'external')).toBeNull();
  });
});

describe('decodeWorkspaceSnapshot', () => {
  it('拒绝只有外壳、内部 state 无效的快照', () => {
    expect(
      decodeWorkspaceSnapshot({
        globalDraft: { state: {}, updatedAt: 1 },
        drafts: [],
        savedTables: [],
        savedDrafts: [],
        folders: [],
      }),
    ).toBeNull();
  });

  it('返回已规范化的合法快照', () => {
    const decoded = decodeWorkspaceSnapshot({
      globalDraft: { state: externalState(), updatedAt: 1 },
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });

    expect(decoded?.globalDraft).toBeNull();
    expect(decoded?.drafts[0]?.state).toMatchObject({
      schemaName: '',
      tableName: 'users',
    });
    expect(decoded?.drafts[0]?.state).not.toHaveProperty('sqlFormatMode');
  });

  it('接受不包含本地编辑状态的协作文档快照', () => {
    const decoded = decodeWorkspaceSnapshot({
      globalDraft: {
        state: {
          tableName: 'users',
          tableComment: '',
          dbType: 'mysql',
          rows: [],
          indexes: [],
          authInput: '',
          authObjects: [],
        },
        updatedAt: 1,
      },
      drafts: [],
      savedTables: [],
      savedDrafts: [],
      folders: [],
    });

    expect(decoded?.globalDraft).toBeNull();
    expect(decoded?.drafts[0]?.state.tableName).toBe('users');
  });

  it('规范化快照中的全部实体和可选字段', () => {
    expect(decodeWorkspaceSnapshot(completeSnapshot())).toEqual({
      globalDraft: null,
      drafts: [
        {
          draftId: 'draft-1',
          state: expect.objectContaining({ tableName: 'users' }),
          createdAt: 1,
          updatedAt: 2,
          folderId: 'folder-1',
        },
      ],
      savedTables: [
        {
          normalizedName: 'public.users',
          name: 'users',
          state: expect.objectContaining({ tableName: 'users' }),
          createdAt: 3,
          updatedAt: 4,
          folderId: 'folder-1',
        },
      ],
      savedDrafts: [
        {
          normalizedName: 'public.users',
          tableName: 'users',
          baseSignature: 'signature',
          state: expect.objectContaining({ tableName: 'users' }),
          updatedAt: 5,
        },
      ],
      folders: [
        {
          id: 'folder-1',
          name: 'Folder',
          parentId: 'parent-1',
          order: 0,
          createdAt: 6,
        },
      ],
    });
  });

  it('保留缺少可选时间和归属字段的实体', () => {
    const snapshot = completeSnapshot();
    delete snapshot.drafts[0]?.createdAt;
    delete snapshot.drafts[0]?.folderId;
    delete snapshot.savedTables[0]?.createdAt;
    delete snapshot.savedTables[0]?.folderId;
    delete snapshot.folders[0]?.parentId;

    const decoded = decodeWorkspaceSnapshot(snapshot);

    expect(decoded?.drafts[0]).not.toHaveProperty('createdAt');
    expect(decoded?.drafts[0]).not.toHaveProperty('folderId');
    expect(decoded?.savedTables[0]).not.toHaveProperty('createdAt');
    expect(decoded?.savedTables[0]).not.toHaveProperty('folderId');
    expect(decoded?.folders[0]).not.toHaveProperty('parentId');
  });

  it.each([
    null,
    {},
    { ...completeSnapshot(), drafts: null },
    { ...completeSnapshot(), savedTables: null },
    { ...completeSnapshot(), savedDrafts: null },
    { ...completeSnapshot(), folders: null },
  ])('拒绝外壳结构非法的快照', (snapshot) => {
    expect(decodeWorkspaceSnapshot(snapshot)).toBeNull();
  });

  it.each([
    { globalDraft: {}, path: 'globalDraft' },
    { globalDraft: { state: externalState(), updatedAt: Number.NaN }, path: 'globalDraft' },
    { globalDraft: { state: {}, updatedAt: 1 }, path: 'globalDraft' },
    { item: null, path: 'drafts' },
    { item: { ...completeSnapshot().drafts[0], draftId: 1 }, path: 'drafts' },
    { item: { ...completeSnapshot().drafts[0], draftId: '' }, path: 'drafts' },
    { item: { ...completeSnapshot().drafts[0], createdAt: Number.NaN }, path: 'drafts' },
    { item: { ...completeSnapshot().drafts[0], updatedAt: Number.NaN }, path: 'drafts' },
    { item: { ...completeSnapshot().drafts[0], folderId: 1 }, path: 'drafts' },
    { item: { ...completeSnapshot().drafts[0], state: {} }, path: 'drafts' },
    { item: null, path: 'savedTables' },
    {
      item: { ...completeSnapshot().savedTables[0], normalizedName: 1 },
      path: 'savedTables',
    },
    {
      item: { ...completeSnapshot().savedTables[0], normalizedName: '' },
      path: 'savedTables',
    },
    { item: { ...completeSnapshot().savedTables[0], name: 1 }, path: 'savedTables' },
    {
      item: { ...completeSnapshot().savedTables[0], createdAt: Number.NaN },
      path: 'savedTables',
    },
    {
      item: { ...completeSnapshot().savedTables[0], updatedAt: Number.NaN },
      path: 'savedTables',
    },
    { item: { ...completeSnapshot().savedTables[0], folderId: 1 }, path: 'savedTables' },
    { item: { ...completeSnapshot().savedTables[0], state: {} }, path: 'savedTables' },
    { item: null, path: 'savedDrafts' },
    {
      item: { ...completeSnapshot().savedDrafts[0], normalizedName: 1 },
      path: 'savedDrafts',
    },
    {
      item: { ...completeSnapshot().savedDrafts[0], normalizedName: '' },
      path: 'savedDrafts',
    },
    { item: { ...completeSnapshot().savedDrafts[0], tableName: 1 }, path: 'savedDrafts' },
    {
      item: { ...completeSnapshot().savedDrafts[0], baseSignature: 1 },
      path: 'savedDrafts',
    },
    {
      item: { ...completeSnapshot().savedDrafts[0], updatedAt: Number.NaN },
      path: 'savedDrafts',
    },
    { item: { ...completeSnapshot().savedDrafts[0], state: {} }, path: 'savedDrafts' },
    { item: null, path: 'folders' },
    { item: { ...completeSnapshot().folders[0], id: 1 }, path: 'folders' },
    { item: { ...completeSnapshot().folders[0], id: '' }, path: 'folders' },
    { item: { ...completeSnapshot().folders[0], name: 1 }, path: 'folders' },
    { item: { ...completeSnapshot().folders[0], parentId: 1 }, path: 'folders' },
    { item: { ...completeSnapshot().folders[0], order: Number.NaN }, path: 'folders' },
    { item: { ...completeSnapshot().folders[0], createdAt: Number.NaN }, path: 'folders' },
  ])('拒绝 $path 中字段非法的实体', ({ globalDraft, item, path }) => {
    const snapshot = completeSnapshot();
    if (globalDraft !== undefined) snapshot.globalDraft = globalDraft;
    if (item !== undefined) {
      snapshot[path as 'drafts'].splice(0, 1, item);
    }

    expect(decodeWorkspaceSnapshot(snapshot)).toBeNull();
  });
});
