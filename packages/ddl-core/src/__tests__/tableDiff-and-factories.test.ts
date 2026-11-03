import { describe, expect, it } from 'vitest';
import type { FieldRow, PersistedState, IndexDefinition } from '@ddlbuilder/shared-types';
import { diffPersistedState, hasTableChanges } from '../utils/tableDiff';
import { buildViewDDL } from '../utils/ddlGenerators';
import { buildTableOptionsClause } from '../utils/tableOptions';

const createPersistedState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  dbType: 'mysql',
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  rows: [],
  indexes: [],
  foreignKeys: [],
  authInput: '',
  authObjects: [],
  sqlFormatMode: 'compact',
  addCount: 10,
  ...overrides,
});

const createRow = (overrides: Partial<FieldRow> = {}): FieldRow => {
  const fieldName = overrides.fieldName ?? 'id';

  return {
    id: `field-${fieldName}`,
    fieldName,
    fieldType: 'int',
    fieldComment: '',
    nullable: false,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
    ...overrides,
  };
};

describe('diffPersistedState', () => {
  it.each([
    [
      { defaultKind: 'uuid', onUpdate: 'current_timestamp' },
      { defaultKind: 'uuid', onUpdate: 'none' },
    ],
  ] as const)('detects default or on-update changes from %j to %j', (before, after) => {
    const diff = diffPersistedState(
      createPersistedState({ rows: [createRow(before)] }),
      createPersistedState({ rows: [createRow(after)] }),
    );
    expect(diff.fields[0].changes).toContain('default');
  });

  it.each([
    [
      'index',
      [
        { name: 'b', direction: 'ASC' },
        { name: 'a', direction: 'ASC' },
      ],
    ],
  ] satisfies [IndexDefinition['kind'], IndexDefinition['fields']][])(
    'rebuilds a %s when its ordered field definition changes to %j',
    (kind, fields) => {
      const index: IndexDefinition = {
        id: 'index',
        name: 'idx_fields',
        kind,
        fields: [
          { name: 'a', direction: 'ASC' },
          { name: 'b', direction: 'ASC' },
        ],
      };
      const diff = diffPersistedState(
        createPersistedState({ indexes: [index] }),
        createPersistedState({ indexes: [{ ...index, fields }] }),
      );
      expect(diff.indexes.map((change) => change.type)).toEqual(['remove', 'add']);
    },
  );

  it('returns no changes when only the field enum encoding differs', () => {
    const legacyRows = [
      {
        id: 'field-id',
        fieldName: 'id',
        fieldType: 'int',
        fieldComment: '',
        nullable: '否',
        defaultKind: '自增',
        onUpdate: '无',
      },
      {
        id: 'field-created_at',
        fieldName: 'created_at',
        fieldType: 'timestamp',
        fieldComment: '',
        nullable: '否',
        defaultKind: '当前时间',
        onUpdate: '当前时间',
      },
    ];
    const currentRows = [
      createRow({ nullable: false, defaultKind: 'auto_increment', onUpdate: 'none' }),
      createRow({
        fieldName: 'created_at',
        fieldType: 'timestamp',
        nullable: false,
        defaultKind: 'current_timestamp',
        onUpdate: 'current_timestamp',
      }),
    ];

    const diff = diffPersistedState(
      // @ts-expect-error This fixture intentionally models legacy persisted enum strings.
      createPersistedState({ rows: legacyRows }),
      createPersistedState({ rows: currentRows }),
    );

    expect(diff.fields).toHaveLength(0);
    expect(hasTableChanges(diff)).toBe(false);
  });

  it('detects removed field', () => {
    const oldState = createPersistedState({
      rows: [createRow(), createRow({ fieldName: 'age', fieldType: 'int' })],
    });
    const newState = createPersistedState({ rows: [createRow()] });
    const diff = diffPersistedState(oldState, newState);
    expect(hasTableChanges(diff)).toBe(true);
    expect(diff.fields).toHaveLength(1);
    expect(diff.fields[0].type).toBe('remove');
    expect(diff.fields[0].fieldName).toBe('age');
  });

  it('detects modified field type', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'age', fieldType: 'int' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'age', fieldType: 'bigint' })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(hasTableChanges(diff)).toBe(true);
    expect(diff.fields[0].type).toBe('modify');
    expect(diff.fields[0].changes).toContain('type');
  });

  it('does not infer a rename from matching type and comment alone', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'old_name', fieldType: 'varchar', fieldComment: '名称' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'new_name', fieldType: 'varchar', fieldComment: '名称' })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields.map((field) => field.type)).toEqual(['remove', 'add']);
  });

  it('uses a stable field id to detect rename and property changes together', () => {
    const oldState = createPersistedState({
      rows: [createRow({ id: 'field-1', fieldName: 'old_name', fieldType: 'varchar' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ id: 'field-1', fieldName: 'new_name', fieldType: 'bigint' })],
    });

    const diff = diffPersistedState(oldState, newState);

    expect(diff.fields).toEqual([
      expect.objectContaining({
        type: 'rename',
        oldFieldName: 'old_name',
        newFieldName: 'new_name',
        changes: ['type'],
      }),
    ]);
  });

  it('ignores stale table options when the feature is disabled', () => {
    const oldState = createPersistedState({
      tableMiscConfig: { enabled: false, fillfactor: 80, storedAs: 'PARQUET' },
    });
    const newState = createPersistedState({ tableMiscConfig: { enabled: false } });

    const diff = diffPersistedState(oldState, newState);

    expect(diff.miscConfigChanged).toBe(false);
    expect(hasTableChanges(diff)).toBe(false);
  });

  it('ignores case difference in field names', () => {
    const oldState = createPersistedState({ rows: [createRow({ fieldName: 'ID' })] });
    const newState = createPersistedState({ rows: [createRow({ fieldName: 'id' })] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields).toHaveLength(0);
    expect(hasTableChanges(diff)).toBe(false);
  });

  it.each(['oracle'] as const)('%s folds unquoted identifiers across schema objects', (dbType) => {
    const before = createPersistedState({
      dbType,
      schemaName: 'app',
      tableName: 'orders',
      rows: [createRow({ id: 'field-id', fieldName: 'id' })],
      indexes: [
        {
          id: 'index-id',
          name: 'idx_id',
          fields: [{ name: 'id', direction: 'ASC' }],
          kind: 'index',
        },
      ],
      foreignKeys: [
        {
          id: 'foreign-key-id',
          name: 'fk_user',
          fields: ['id'],
          refSchema: 'app',
          refTable: 'users',
          refFields: ['id'],
        },
      ],
    });
    const after = createPersistedState({
      ...before,
      schemaName: 'APP',
      tableName: 'ORDERS',
      rows: [createRow({ id: 'field-id', fieldName: 'ID' })],
      indexes: [
        {
          id: 'index-id',
          name: 'IDX_ID',
          fields: [{ name: 'ID', direction: 'ASC' }],
          kind: 'index',
        },
      ],
      foreignKeys: [
        {
          id: 'foreign-key-id',
          name: 'FK_USER',
          fields: ['ID'],
          refSchema: 'APP',
          refTable: 'USERS',
          refFields: ['ID'],
        },
      ],
    });

    expect(diffPersistedState(before, after)).toMatchObject({
      schemaNameChanged: false,
      tableNameChanged: false,
      fields: [],
      indexes: [],
      foreignKeys: [],
    });
  });

  it.each(['oracle'] as const)(
    '%s preserves quoted identifier identity in table diffs',
    (dbType) => {
      const before = createPersistedState({
        dbType,
        schemaName: 'APP',
        tableName: 'ORDERS',
        rows: [createRow({ id: 'field-id', fieldName: 'ID' })],
      });
      const after = createPersistedState({
        ...before,
        schemaName: '"app"',
        tableName: '"orders"',
        rows: [createRow({ id: 'field-id', fieldName: '"id"' })],
      });
      const diff = diffPersistedState(before, after);

      expect(diff).toMatchObject({
        schemaNameChanged: true,
        tableNameChanged: true,
        fields: [
          {
            type: 'rename',
            oldFieldName: 'ID',
            newFieldName: '"id"',
          },
        ],
      });
    },
  );

  it('skips empty field names', () => {
    const oldState = createPersistedState({ rows: [createRow({ fieldName: '' })] });
    const newState = createPersistedState({ rows: [createRow({ fieldName: ' ' })] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields).toHaveLength(0);
  });
});

describe('buildViewDDL', () => {
  it('generates SQL Server view with CREATE OR ALTER', () => {
    const ddl = buildViewDDL('sqlserver', 'v_users', 'SELECT * FROM users');
    expect(ddl).toBe('CREATE OR ALTER VIEW v_users AS\nSELECT * FROM users;');
  });
});

describe('tableOptions', () => {
  it('buildTableOptionsClause clamps out-of-range numeric options', () => {
    expect(buildTableOptionsClause('postgresql', { enabled: true, fillfactor: -50 })).toBe(
      ' WITH (fillfactor = 10)',
    );
    expect(buildTableOptionsClause('oracle', { enabled: true, pctfree: 500, initrans: 0 })).toBe(
      ' PCTFREE 99 INITRANS 1',
    );
  });
});
