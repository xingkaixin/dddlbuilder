/* oxlint-disable anti-slop/no-unsafe-dictionary-type -- These fixtures intentionally model unparsed external snapshot records. */

import { describe, expect, it } from 'vitest';
import { decodePersistedState, decodeWorkspaceSnapshot } from '../persistedStateCodec';

const externalState = (overrides: Record<string, unknown> = {}) => ({
  tableName: 'users',
  tableComment: '',
  dbType: 'mysql',
  rows: [],
  addCount: 10,
  indexes: [],
  authInput: '',
  authObjects: [],
  ...overrides,
});

type DecoderFixtureRecord = Record<string, unknown>;

type DecoderSnapshotFixture = {
  globalDraft: DecoderFixtureRecord | null;
  drafts: DecoderFixtureRecord[];
  savedTables: DecoderFixtureRecord[];
  savedDrafts: DecoderFixtureRecord[];
  folders: DecoderFixtureRecord[];
};

const completeSnapshot = (): DecoderSnapshotFixture => ({
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
      updatedAt: 7,
    },
  ],
});

describe('decodePersistedState', () => {
  it.each(['compatible', 'external'] as const)('校验枚举成员并保留合法元数据 (%s)', (mode) => {
    const decoded = decodePersistedState(
      externalState({
        rows: [
          {
            fieldName: 'status',
            enumMeta: [
              null,
              false,
              1,
              'invalid',
              [],
              {},
              { value: 1 },
              {
                value: 'active',
                color: '#16a34a',
                i18n: { 'zh-CN': '启用', 'en-US': 'Active', 'ja-JP': '有効', invalid: {} },
                extra: true,
              },
              { value: '', color: 1, i18n: [] },
              { value: ' spaced ', i18n: null },
            ],
          },
        ],
      }),
      mode,
    );

    expect(decoded?.rows[0].enumMeta).toEqual([
      {
        value: 'active',
        color: '#16a34a',
        i18n: { 'zh-CN': '启用', 'en-US': 'Active', 'ja-JP': '有効' },
      },
      { value: '' },
      { value: ' spaced ' },
    ]);
    expect(decodePersistedState(JSON.parse(JSON.stringify(decoded)), mode)).toEqual(decoded);
  });

  it('assigns deterministic unique IDs to legacy partitions and keeps existing identities', () => {
    const source = externalState({
      mysqlPartitionConfig: {
        enabled: true,
        type: 'RANGE',
        columns: ['id'],
        partitions: [
          { name: 'p1', value: '10' },
          { id: 'stable', name: 'p2', value: '20' },
          { id: 'stable', name: 'p3', value: '30' },
        ],
      },
    });
    const decoded = decodePersistedState(source);
    const ids = decoded?.mysqlPartitionConfig?.partitions?.map((partition) => partition.id) ?? [];
    expect(new Set(ids).size).toBe(3);
    expect(ids[1]).toBe('stable');
    expect(decodePersistedState(source)).toEqual(decoded);
    expect(decodePersistedState(decoded)).toEqual(decoded);
  });

  it('keeps invalid foreign key positions instead of realigning column pairs', () => {
    const decoded = decodePersistedState(
      externalState({
        foreignKeys: [
          {
            id: 'fk',
            name: 'fk_owner',
            refTable: 'users',
            fields: ['tenant_id', null, 'user_id'],
            refFields: ['id', 'tenant_id', null],
          },
        ],
      }),
    );
    expect(decoded?.foreignKeys?.[0]).toMatchObject({
      fields: ['tenant_id', '', 'user_id'],
      refFields: ['id', 'tenant_id', ''],
    });
    expect(decodePersistedState(JSON.parse(JSON.stringify(decoded)))?.foreignKeys).toEqual(
      decoded?.foreignKeys,
    );
  });

  it('preserves unique constraint identity through serialization and decoding', () => {
    const constraint = {
      id: 'uq',
      name: 'uq_email',
      unique: true,
      isUniqueConstraint: true,
      fields: [{ name: 'email', direction: 'ASC' }],
    };
    const state = decodePersistedState(externalState({ indexes: [constraint] }));
    expect(decodePersistedState(JSON.parse(JSON.stringify(state)))?.indexes).toEqual([
      {
        id: constraint.id,
        name: constraint.name,
        fields: constraint.fields,
        kind: 'unique_constraint',
      },
    ]);
  });

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

  it('确定性修复重复和空白的实体 id', () => {
    const input = externalState({
      rows: [
        { id: 'field-1', fieldName: 'id' },
        { id: 'field-1', fieldName: 'email' },
        { id: '  ', fieldName: 'name' },
      ],
      indexes: [
        { id: 'index-1', name: 'idx_id' },
        { id: 'index-1', name: 'idx_email' },
      ],
      foreignKeys: [
        { id: 'foreign-key-1', name: 'fk_team', refTable: 'teams' },
        { id: 'foreign-key-1', name: 'fk_org', refTable: 'organizations' },
      ],
    });

    const first = decodePersistedState(input);
    const second = decodePersistedState(input);

    expect(first).toEqual(second);
    expect(first?.rows.map(({ id }) => id)).toEqual([
      'field-1',
      'legacy-field-1',
      'legacy-field-2',
    ]);
    expect(first?.indexes.map(({ id }) => id)).toEqual(['index-1', 'legacy-index-1']);
    expect(first?.foreignKeys?.map(({ id }) => id)).toEqual([
      'foreign-key-1',
      'legacy-foreign-key-1',
    ]);
  });

  it('兼容模式修复未知数据库类型，外部模式拒绝不完整或未知输入', () => {
    expect(decodePersistedState({ tableName: 'users', dbType: 'unknown' })?.dbType).toBe('mysql');
    expect(decodePersistedState({}, 'external')).toBeNull();
    expect(decodePersistedState({ ...externalState(), dbType: 'unknown' }, 'external')).toBeNull();
    expect(decodePersistedState(null)).toBeNull();
    expect(decodePersistedState([])).toBeNull();
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

  it.each([
    {
      collection: 'drafts',
      duplicate: () => ({ ...completeSnapshot().drafts[0], updatedAt: 8 }),
    },
    {
      collection: 'savedTables',
      duplicate: () => ({ ...completeSnapshot().savedTables[0], name: 'Duplicate' }),
    },
  ] as const)('拒绝 $collection 中重复的逻辑实体', ({ collection, duplicate }) => {
    const snapshot = completeSnapshot();
    // SAFETY: duplicate() intentionally violates the snapshot fixture union to test rejection.
    snapshot[collection].push(duplicate() as never);

    expect(decodeWorkspaceSnapshot(snapshot)).toBeNull();
  });

  it('按唯一表身份拒绝重复的表草稿', () => {
    const snapshot = completeSnapshot();
    snapshot.savedTables = [{ ...snapshot.savedTables[0], tableId: 'table-1' }];
    snapshot.savedDrafts.push({
      ...snapshot.savedDrafts[0],
      tableId: 'table-1',
      normalizedName: 'renamed.users',
    });

    expect(decodeWorkspaceSnapshot(snapshot)).toBeNull();
  });

  it('拒绝无法确定所属表的旧表草稿', () => {
    const snapshot = completeSnapshot();
    snapshot.savedTables = [
      { ...snapshot.savedTables[0], tableId: 'table-1' },
      { ...snapshot.savedTables[0], tableId: 'table-2' },
    ];

    expect(decodeWorkspaceSnapshot(snapshot)).toBeNull();
  });
});

it.each(['"my.table"', '`my.table`'])(
  'preserves a quoted table name %s through decoding',
  (tableName) => {
    const decoded = decodePersistedState({ tableName, dbType: 'postgresql' });
    expect(decoded).toMatchObject({ schemaName: '', tableName });
  },
);
