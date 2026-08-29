import { describe, expect, it } from 'vitest';
import type {
  FieldRow,
  PersistedState,
  NormalizedField,
  IndexDefinition,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { diffPersistedState } from '../utils/tableDiff';
import { buildDDL, buildViewDDL, buildDCL, buildOracleSynonyms } from '../utils/ddlGenerators';
import {
  supportsStorageOption,
  supportsEngineOption,
  supportsCharsetOption,
  supportsCollationOption,
  supportsTablespaceOption,
  supportsFillfactorOption,
  supportsOracleStorageOption,
  buildTableOptionsClause,
} from '../utils/tableOptions';

const createPersistedState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  tableName: 'users',
  tableComment: '',
  rows: [],
  indexes: [],
  foreignKeys: [],
  ...overrides,
});

const createRow = (overrides: Partial<FieldRow> = {}): FieldRow => ({
  order: 1,
  fieldName: 'id',
  fieldType: 'int',
  fieldComment: '',
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

describe('diffPersistedState', () => {
  it('detects an enum label change as a column comment change', () => {
    const row = createRow({
      id: 'field-id',
      enumMeta: [{ value: 'active', i18n: { 'en-US': 'Active' } }],
    });
    const before = createPersistedState({ rows: [row] });
    const after = createPersistedState({
      rows: [{ ...row, enumMeta: [{ value: 'active', i18n: { 'en-US': 'Enabled' } }] }],
    });
    const diff = diffPersistedState(before, after);
    console.info('enum label diff', diff.fields);
    expect(diff.hasChanges).toBe(true);
    expect(diff.fields[0].changes).toEqual(['comment']);
  });

  it('returns no changes for identical states', () => {
    const state = createPersistedState({ rows: [createRow()] });
    const diff = diffPersistedState(state, state);
    expect(diff.hasChanges).toBe(false);
    expect(diff.fields).toHaveLength(0);
    expect(diff.indexes).toHaveLength(0);
    expect(diff.foreignKeys).toHaveLength(0);
  });

  it('returns no changes when only the field enum encoding differs', () => {
    const legacyRows = [
      { fieldName: 'id', nullable: '否', defaultKind: '自增', onUpdate: '无' },
      {
        order: 2,
        fieldName: 'created_at',
        fieldType: 'timestamp',
        nullable: '否',
        defaultKind: '当前时间',
        onUpdate: '当前时间',
      },
    ].map((row) => createRow(row as Partial<FieldRow>));
    const currentRows = [
      createRow({ nullable: false, defaultKind: 'auto_increment', onUpdate: 'none' }),
      createRow({
        order: 2,
        fieldName: 'created_at',
        fieldType: 'timestamp',
        nullable: false,
        defaultKind: 'current_timestamp',
        onUpdate: 'current_timestamp',
      }),
    ];

    const diff = diffPersistedState(
      createPersistedState({ rows: legacyRows }),
      createPersistedState({ rows: currentRows }),
    );

    expect(diff.fields).toHaveLength(0);
    expect(diff.hasChanges).toBe(false);
  });

  it('detects table name change', () => {
    const oldState = createPersistedState({ tableName: 'users' });
    const newState = createPersistedState({ tableName: 'accounts' });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(true);
    expect(diff.tableNameChanged).toBe(true);
    expect(diff.oldTableName).toBe('users');
    expect(diff.newTableName).toBe('accounts');
  });

  it('detects schema changes independently of the table name', () => {
    const diff = diffPersistedState(
      createPersistedState({ schemaName: 'public' }),
      createPersistedState({ schemaName: 'archive' }),
    );
    expect(diff).toMatchObject({
      hasChanges: true,
      schemaNameChanged: true,
      tableNameChanged: false,
      oldSchemaName: 'public',
      newSchemaName: 'archive',
    });
  });

  it('detects table comment change', () => {
    const oldState = createPersistedState({ tableComment: '' });
    const newState = createPersistedState({ tableComment: '用户表' });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(true);
    expect(diff.tableCommentChanged).toBe(true);
    expect(diff.oldTableComment).toBe('');
    expect(diff.newTableComment).toBe('用户表');
  });

  it('detects added field', () => {
    const oldState = createPersistedState({ rows: [createRow()] });
    const newState = createPersistedState({
      rows: [createRow(), createRow({ fieldName: 'age', fieldType: 'int' })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(true);
    expect(diff.fields).toHaveLength(1);
    expect(diff.fields[0].type).toBe('add');
    expect(diff.fields[0].fieldName).toBe('age');
  });

  it('detects removed field', () => {
    const oldState = createPersistedState({
      rows: [createRow(), createRow({ fieldName: 'age', fieldType: 'int' })],
    });
    const newState = createPersistedState({ rows: [createRow()] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(true);
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
    expect(diff.hasChanges).toBe(true);
    expect(diff.fields[0].type).toBe('modify');
    expect(diff.fields[0].changes).toContain('type');
  });

  it('detects modified field nullable', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'age', nullable: false })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'age', nullable: true })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields[0].type).toBe('modify');
    expect(diff.fields[0].changes).toContain('nullable');
  });

  it('detects modified field default', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'status', defaultKind: 'none', defaultValue: '' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'status', defaultKind: 'constant', defaultValue: 'active' })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields[0].type).toBe('modify');
    expect(diff.fields[0].changes).toContain('default');
  });

  it('detects modified field comment', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'age', fieldComment: '' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'age', fieldComment: '年龄' })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields[0].type).toBe('modify');
    expect(diff.fields[0].changes).toContain('comment');
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

  it('does not infer a rename between fields with different stable ids', () => {
    const oldState = createPersistedState({
      rows: [
        createRow({
          id: 'field-old',
          fieldName: 'old_name',
          fieldType: 'varchar',
          fieldComment: '名称',
        }),
      ],
    });
    const newState = createPersistedState({
      rows: [
        createRow({
          id: 'field-new',
          fieldName: 'new_name',
          fieldType: 'varchar',
          fieldComment: '名称',
        }),
      ],
    });

    const diff = diffPersistedState(oldState, newState);

    expect(diff.fields.map(({ type }) => type)).toEqual(['remove', 'add']);
  });

  it('does not rename when type differs', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'old_name', fieldType: 'varchar', fieldComment: '名称' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'new_name', fieldType: 'int', fieldComment: '名称' })],
    });
    const diff = diffPersistedState(oldState, newState);
    const renameFields = diff.fields.filter((f) => f.type === 'rename');
    expect(renameFields).toHaveLength(0);
    expect(diff.fields).toHaveLength(2); // one remove, one add
  });

  it('does not guess renames when multiple fields share the same structure', () => {
    const oldState = createPersistedState({
      rows: [
        createRow({ fieldName: 'first_name', fieldType: 'varchar', fieldComment: '名称' }),
        createRow({ fieldName: 'last_name', fieldType: 'varchar', fieldComment: '名称' }),
      ],
    });
    const newState = createPersistedState({
      rows: [
        createRow({ fieldName: 'given_name', fieldType: 'varchar', fieldComment: '名称' }),
        createRow({ fieldName: 'family_name', fieldType: 'varchar', fieldComment: '名称' }),
      ],
    });

    const diff = diffPersistedState(oldState, newState);

    expect(diff.fields.filter((field) => field.type === 'rename')).toHaveLength(0);
    expect(diff.fields.filter((field) => field.type === 'remove')).toHaveLength(2);
    expect(diff.fields.filter((field) => field.type === 'add')).toHaveLength(2);
  });

  it('detects an index name change', () => {
    const index = {
      name: 'idx_users_email',
      fields: [{ name: 'email', direction: 'ASC' as const }],
      kind: 'index',
    };
    const oldState = createPersistedState({ indexes: [index] });
    const newState = createPersistedState({
      indexes: [{ ...index, name: 'idx_accounts_email' }],
    });

    const diff = diffPersistedState(oldState, newState);

    expect(diff.indexes).toEqual([
      { type: 'remove', index },
      { type: 'add', index: { ...index, name: 'idx_accounts_email' } },
    ]);
  });

  it('detects added index', () => {
    const oldState = createPersistedState({ indexes: [] });
    const newState = createPersistedState({
      indexes: [
        {
          name: 'idx_age',
          fields: [{ name: 'age', direction: 'ASC' }],
          kind: 'index',
        },
      ],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(true);
    expect(diff.indexes).toHaveLength(1);
    expect(diff.indexes[0].type).toBe('add');
  });

  it('detects removed index', () => {
    const oldState = createPersistedState({
      indexes: [
        {
          name: 'idx_age',
          fields: [{ name: 'age', direction: 'ASC' }],
          kind: 'index',
        },
      ],
    });
    const newState = createPersistedState({ indexes: [] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.indexes).toHaveLength(1);
    expect(diff.indexes[0].type).toBe('remove');
  });

  it('ignores identical indexes', () => {
    const idx: IndexDefinition = {
      name: 'idx_age',
      fields: [{ name: 'age', direction: 'ASC' }],
      kind: 'index',
    };
    const oldState = createPersistedState({ indexes: [idx] });
    const newState = createPersistedState({ indexes: [idx] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.indexes).toHaveLength(0);
  });

  it('detects added foreign key', () => {
    const oldState = createPersistedState({ foreignKeys: [] });
    const newState = createPersistedState({
      foreignKeys: [{ name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] }],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(true);
    expect(diff.foreignKeys).toHaveLength(1);
    expect(diff.foreignKeys[0].type).toBe('add');
  });

  it('detects removed foreign key', () => {
    const oldState = createPersistedState({
      foreignKeys: [{ name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] }],
    });
    const newState = createPersistedState({ foreignKeys: [] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.foreignKeys).toHaveLength(1);
    expect(diff.foreignKeys[0].type).toBe('remove');
  });

  it('detects misc config change', () => {
    const oldState = createPersistedState({ tableMiscConfig: { enabled: false } });
    const newState = createPersistedState({ tableMiscConfig: { enabled: true, engine: 'InnoDB' } });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(true);
    expect(diff.miscConfigChanged).toBe(true);
  });

  it('ignores stale table options when the feature is disabled', () => {
    const oldState = createPersistedState({
      tableMiscConfig: { enabled: false, fillfactor: 80, storedAs: 'PARQUET' },
    });
    const newState = createPersistedState({ tableMiscConfig: { enabled: false } });

    const diff = diffPersistedState(oldState, newState);

    expect(diff.miscConfigChanged).toBe(false);
    expect(diff.hasChanges).toBe(false);
  });

  it('detects Hive storage and partition option changes', () => {
    const oldState = createPersistedState({
      tableMiscConfig: { enabled: true, storedAs: 'ORC' },
    });
    const newState = createPersistedState({
      tableMiscConfig: {
        enabled: true,
        storedAs: 'PARQUET',
        partitions: {
          enabled: true,
          columns: [{ name: 'day', type: 'STRING', comment: '' }],
        },
      },
    });

    const diff = diffPersistedState(oldState, newState);

    expect(diff.miscConfigChanged).toBe(true);
    expect(diff.hasChanges).toBe(true);
  });

  it('ignores case difference in field names', () => {
    const oldState = createPersistedState({ rows: [createRow({ fieldName: 'ID' })] });
    const newState = createPersistedState({ rows: [createRow({ fieldName: 'id' })] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields).toHaveLength(0);
    expect(diff.hasChanges).toBe(false);
  });

  it.each(['oracle', 'oceanbase-oracle', 'dm'] as const)(
    '%s folds unquoted identifiers across schema objects',
    (dbType) => {
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
        hasChanges: false,
        schemaNameChanged: false,
        tableNameChanged: false,
        fields: [],
        indexes: [],
        foreignKeys: [],
      });
    },
  );

  it.each(['oracle', 'oceanbase-oracle', 'dm'] as const)(
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
        hasChanges: true,
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

  it('does not conflate quoted punctuation across index and foreign key parts', () => {
    const before = createPersistedState({
      dbType: 'oracle',
      indexes: [
        {
          id: 'index-id',
          name: '"A:B"',
          fields: [{ name: 'C', direction: 'ASC' }],
          kind: 'index',
        },
      ],
      foreignKeys: [
        {
          id: 'foreign-key-id',
          name: '"A:B"',
          fields: ['C'],
          refTable: 'USERS',
          refFields: ['ID'],
        },
      ],
    });
    const after = createPersistedState({
      ...before,
      indexes: [
        {
          id: 'index-id',
          name: 'A',
          fields: [{ name: '"B:C"', direction: 'ASC' }],
          kind: 'index',
        },
      ],
      foreignKeys: [
        {
          id: 'foreign-key-id',
          name: 'A',
          fields: ['"B:C"'],
          refTable: 'USERS',
          refFields: ['ID'],
        },
      ],
    });
    const diff = diffPersistedState(before, after);

    expect(diff.indexes.map((change) => change.type)).toEqual(['remove', 'add']);
    expect(diff.foreignKeys.map((change) => change.type)).toEqual(['remove', 'add']);
  });

  it('handles empty rows gracefully', () => {
    const oldState = createPersistedState({ rows: [] });
    const newState = createPersistedState({ rows: [] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.hasChanges).toBe(false);
    expect(diff.fields).toHaveLength(0);
  });

  it('skips empty field names', () => {
    const oldState = createPersistedState({ rows: [createRow({ fieldName: '' })] });
    const newState = createPersistedState({ rows: [createRow({ fieldName: ' ' })] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields).toHaveLength(0);
  });
});

describe('buildDDL', () => {
  const fields: NormalizedField[] = [
    {
      name: 'id',
      type: 'bigint',
      comment: '主键',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'name',
      type: 'varchar',
      comment: '名称',
      nullable: false,
      defaultValue: '',
      defaultKind: 'none',
      onUpdate: 'none',
    },
  ];

  it('returns prompt when table name is empty', () => {
    const ddl = buildDDL({ dbType: 'mysql', tableName: '', tableComment: '', fields });
    expect(ddl).toBe('-- 请填写表名');
  });

  it('returns prompt when no fields', () => {
    const ddl = buildDDL({ dbType: 'mysql', tableName: 'users', tableComment: '', fields: [] });
    expect(ddl).toBe('-- 请补充字段信息');
  });

  it('generates MySQL CREATE TABLE', () => {
    const ddl = buildDDL({ dbType: 'mysql', tableName: 'users', tableComment: '用户表', fields });
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).toContain('id BIGINT AUTO_INCREMENT NOT NULL');
    expect(ddl).toContain('name VARCHAR(255) NOT NULL');
  });

  it('generates PostgreSQL CREATE TABLE', () => {
    const ddl = buildDDL({
      dbType: 'postgresql',
      tableName: 'users',
      tableComment: '用户表',
      fields,
    });
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).toContain('id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL');
    expect(ddl).toContain('name VARCHAR NOT NULL');
  });

  it('includes index DDL', () => {
    const indexes: IndexDefinition[] = [
      {
        name: 'idx_name',
        fields: [{ name: 'name', direction: 'ASC' }],
        kind: 'index',
      },
    ];
    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes,
    });
    expect(ddl.split(';')[0]).toContain('INDEX idx_name (name ASC)');
  });

  it('includes foreign key DDL', () => {
    const fks: ForeignKeyDefinition[] = [
      { name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
    ];
    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: 'orders',
      tableComment: '',
      fields,
      indexes: [],
      sqlFormatMode: 'compact',
      foreignKeys: fks,
    });
    expect(ddl).toContain('ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY');
  });

  it('includes table options for mysql', () => {
    const misc: TableMiscConfig = {
      enabled: true,
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collation: 'utf8mb4_unicode_ci',
    };
    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [],
      tableMiscConfig: misc,
    });
    expect(ddl).toContain('ENGINE=InnoDB');
    expect(ddl).toContain('DEFAULT CHARSET=utf8mb4');
    expect(ddl).toContain('COLLATE=utf8mb4_unicode_ci');
  });

  it('includes Citus sharding DDL', () => {
    const ddl = buildDDL({
      dbType: 'postgresql-citus',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [],
      citusShardingConfig: {
        mode: 'distributed',
        distributionColumn: 'tenant_id',
      },
    });
    expect(ddl).toContain("SELECT create_distributed_table('users', 'tenant_id')");
  });

  it('includes reference table DDL for Citus', () => {
    const ddl = buildDDL({
      dbType: 'postgresql-citus',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [],
      citusShardingConfig: { mode: 'reference' },
    });
    expect(ddl).toContain("SELECT create_reference_table('users')");
  });

  it('does not create public Oracle synonyms implicitly', () => {
    const ddl = buildDDL({ dbType: 'oracle', tableName: 'users', tableComment: '', fields });
    expect(ddl).not.toContain('PUBLIC SYNONYM');
  });
});

describe('buildViewDDL', () => {
  it('returns prompt for empty view name', () => {
    expect(buildViewDDL('mysql', '', 'SELECT * FROM users')).toBe('-- 请填写视图名');
  });

  it('returns prompt for empty definition', () => {
    expect(buildViewDDL('mysql', 'v_users', '')).toBe('-- 请填写视图 SQL');
  });

  it('generates MySQL view with CREATE OR REPLACE', () => {
    const ddl = buildViewDDL('mysql', 'v_users', 'SELECT * FROM users');
    expect(ddl).toBe('CREATE OR REPLACE VIEW v_users AS\nSELECT * FROM users;');
  });

  it('generates SQL Server view with CREATE OR ALTER', () => {
    const ddl = buildViewDDL('sqlserver', 'v_users', 'SELECT * FROM users');
    expect(ddl).toBe('CREATE OR ALTER VIEW v_users AS\nSELECT * FROM users;');
  });

  it('generates view without OR REPLACE when disabled', () => {
    const ddl = buildViewDDL('mysql', 'v_users', 'SELECT * FROM users', false);
    expect(ddl).toBe('CREATE VIEW v_users AS\nSELECT * FROM users;');
  });

  it('trims trailing semicolons from definition', () => {
    const ddl = buildViewDDL('mysql', 'v_users', 'SELECT * FROM users;;');
    expect(ddl).toBe('CREATE OR REPLACE VIEW v_users AS\nSELECT * FROM users;');
  });
});

describe('buildDCL', () => {
  it('returns empty for empty table name', () => {
    expect(buildDCL('', ['user1'])).toBe('');
  });

  it('returns empty for empty auth objects', () => {
    expect(buildDCL('users', [])).toBe('');
  });

  it('generates GRANT statements', () => {
    const dcl = buildDCL('users', ['app_user', 'readonly_user']);
    expect(dcl).toBe('GRANT SELECT ON users TO app_user;\nGRANT SELECT ON users TO readonly_user;');
  });

  it('trims auth object names', () => {
    const dcl = buildDCL('users', ['  app_user  ']);
    expect(dcl).toBe('GRANT SELECT ON users TO app_user;');
  });
});

describe('buildOracleSynonyms', () => {
  it('returns empty for empty table name', () => {
    expect(buildOracleSynonyms('')).toBe('');
  });

  it('generates public synonym', () => {
    expect(buildOracleSynonyms('users')).toBe('CREATE OR REPLACE PUBLIC SYNONYM users FOR users;');
  });

  it('trims table name', () => {
    expect(buildOracleSynonyms('  users  ')).toBe(
      'CREATE OR REPLACE PUBLIC SYNONYM users FOR users;',
    );
  });
});

describe('tableOptions', () => {
  it('buildTableOptionsClause returns empty when disabled', () => {
    expect(buildTableOptionsClause('mysql', { enabled: false })).toBe('');
  });

  it('buildTableOptionsClause returns empty for hive', () => {
    expect(buildTableOptionsClause('hive', { enabled: true, engine: 'ORC' })).toBe('');
  });

  it('buildTableOptionsClause includes engine for mysql', () => {
    const clause = buildTableOptionsClause('mysql', { enabled: true, engine: 'InnoDB' });
    expect(clause).toBe(' ENGINE=InnoDB');
  });

  it('buildTableOptionsClause includes charset and collation for mysql', () => {
    const clause = buildTableOptionsClause('mysql', {
      enabled: true,
      charset: 'utf8mb4',
      collation: 'utf8mb4_unicode_ci',
    });
    expect(clause).toBe(' DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci');
  });

  it('buildTableOptionsClause includes tablespace for postgresql', () => {
    const clause = buildTableOptionsClause('postgresql', {
      enabled: true,
      tablespace: 'pg_default',
    });
    expect(clause).toBe(' TABLESPACE pg_default');
  });

  it('buildTableOptionsClause includes fillfactor for postgresql', () => {
    const clause = buildTableOptionsClause('postgresql', { enabled: true, fillfactor: 80 });
    expect(clause).toBe(' WITH (fillfactor = 80)');
  });

  it('buildTableOptionsClause includes oracle storage options', () => {
    const clause = buildTableOptionsClause('oracle', { enabled: true, pctfree: 10, initrans: 2 });
    expect(clause).toBe(' STORAGE (PCTFREE 10 INITRANS 2)');
  });

  it('buildTableOptionsClause clamps out-of-range numeric options', () => {
    expect(buildTableOptionsClause('postgresql', { enabled: true, fillfactor: -50 })).toBe(
      ' WITH (fillfactor = 10)',
    );
    expect(buildTableOptionsClause('oracle', { enabled: true, pctfree: 500, initrans: 0 })).toBe(
      ' STORAGE (PCTFREE 99 INITRANS 1)',
    );
  });

  it('buildTableOptionsClause ignores Default value', () => {
    const clause = buildTableOptionsClause('mysql', { enabled: true, engine: 'Default' });
    expect(clause).toBe('');
  });

  it('supportsEngineOption returns true for mysql-like DBs', () => {
    expect(supportsEngineOption('mysql')).toBe(true);
    expect(supportsEngineOption('postgresql')).toBe(false);
    expect(supportsEngineOption('hive')).toBe(false);
  });

  it('supportsCharsetOption returns true for mysql-like DBs', () => {
    expect(supportsCharsetOption('mysql')).toBe(true);
    expect(supportsCharsetOption('oracle')).toBe(false);
  });

  it('supportsCollationOption returns true for mysql-like DBs', () => {
    expect(supportsCollationOption('mariadb')).toBe(true);
    expect(supportsCollationOption('sqlserver')).toBe(false);
  });

  it('supportsTablespaceOption returns true for PG-like DBs', () => {
    expect(supportsTablespaceOption('postgresql')).toBe(true);
    expect(supportsTablespaceOption('kingbase')).toBe(true);
    expect(supportsTablespaceOption('mysql')).toBe(false);
  });

  it('supportsFillfactorOption returns true for PG-like DBs', () => {
    expect(supportsFillfactorOption('postgresql')).toBe(true);
    expect(supportsFillfactorOption('gaussdb')).toBe(true);
    expect(supportsFillfactorOption('oracle')).toBe(false);
  });

  it('supportsOracleStorageOption returns true for Oracle-like DBs', () => {
    expect(supportsOracleStorageOption('oracle')).toBe(true);
    expect(supportsOracleStorageOption('oceanbase-oracle')).toBe(true);
    expect(supportsOracleStorageOption('mysql')).toBe(false);
  });

  it('supportsStorageOption returns true only for hive', () => {
    expect(supportsStorageOption('hive')).toBe(true);
    expect(supportsStorageOption('mysql')).toBe(false);
  });
});
