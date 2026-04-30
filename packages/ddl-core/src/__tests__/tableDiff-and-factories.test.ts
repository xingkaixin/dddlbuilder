import { describe, expect, it } from 'vitest';
import type {
  PersistedState,
  NormalizedField,
  IndexDefinition,
  TableMiscConfig,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { diffPersistedState } from '../utils/tableDiff';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory';
import { ORMGeneratorFactory } from '../factories/ORMGeneratorFactory';
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
import { TypeMapper } from '../utils/TypeMapper';

const createPersistedState = (overrides: Partial<PersistedState> = {}): PersistedState => ({
  tableName: 'users',
  tableComment: '',
  rows: [],
  indexes: [],
  foreignKeys: [],
  ...overrides,
});

const createRow = (overrides: Partial<Record<string, string>> = {}): Record<string, string> => ({
  fieldName: 'id',
  fieldType: 'int',
  fieldComment: '',
  nullable: '否',
  defaultKind: '',
  defaultValue: '',
  onUpdate: '',
  ...overrides,
});

describe('diffPersistedState', () => {
  it('returns no changes for identical states', () => {
    const state = createPersistedState({ rows: [createRow()] });
    const diff = diffPersistedState(state, state);
    expect(diff.hasChanges).toBe(false);
    expect(diff.fields).toHaveLength(0);
    expect(diff.indexes).toHaveLength(0);
    expect(diff.foreignKeys).toHaveLength(0);
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
      rows: [createRow({ fieldName: 'age', nullable: '否' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'age', nullable: '是' })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields[0].type).toBe('modify');
    expect(diff.fields[0].changes).toContain('nullable');
  });

  it('detects modified field default', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'status', defaultKind: '', defaultValue: '' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'status', defaultKind: '常量', defaultValue: 'active' })],
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

  it('detects rename when type and comment match', () => {
    const oldState = createPersistedState({
      rows: [createRow({ fieldName: 'old_name', fieldType: 'varchar', fieldComment: '名称' })],
    });
    const newState = createPersistedState({
      rows: [createRow({ fieldName: 'new_name', fieldType: 'varchar', fieldComment: '名称' })],
    });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields).toHaveLength(1);
    expect(diff.fields[0].type).toBe('rename');
    expect(diff.fields[0].oldFieldName).toBe('old_name');
    expect(diff.fields[0].newFieldName).toBe('new_name');
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

  it('detects added index', () => {
    const oldState = createPersistedState({ indexes: [] });
    const newState = createPersistedState({
      indexes: [
        {
          name: 'idx_age',
          fields: [{ name: 'age', direction: 'ASC' }],
          unique: false,
          isPrimary: false,
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
          unique: false,
          isPrimary: false,
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
      unique: false,
      isPrimary: false,
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

  it('ignores case difference in field names', () => {
    const oldState = createPersistedState({ rows: [createRow({ fieldName: 'ID' })] });
    const newState = createPersistedState({ rows: [createRow({ fieldName: 'id' })] });
    const diff = diffPersistedState(oldState, newState);
    expect(diff.fields).toHaveLength(0);
    expect(diff.hasChanges).toBe(false);
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

describe('DDLStrategyFactory', () => {
  it('creates strategy for all supported databases', () => {
    const types = DDLStrategyFactory.getSupportedDatabaseTypes();
    for (const dbType of types) {
      const strategy = DDLStrategyFactory.create(dbType);
      expect(strategy).toBeDefined();
      expect(strategy.getDatabaseType()).toBe(dbType);
    }
  });

  it('throws for unsupported database', () => {
    expect(() => DDLStrategyFactory.create('unknown' as any)).toThrow('Unsupported database type');
  });

  it('returns supported types list', () => {
    const types = DDLStrategyFactory.getSupportedDatabaseTypes();
    expect(types).toContain('mysql');
    expect(types).toContain('postgresql');
    expect(types).toContain('oracle');
    expect(types).toContain('sqlserver');
    expect(types.length).toBeGreaterThan(10);
  });

  it('allows registering custom strategy', () => {
    const mockStrategy = DDLStrategyFactory.create('mysql');
    DDLStrategyFactory.registerStrategy('custom-db' as any, mockStrategy);
    expect(DDLStrategyFactory.create('custom-db' as any)).toBe(mockStrategy);
  });
});

describe('ORMGeneratorFactory', () => {
  it('creates generator for all supported targets', () => {
    const targets = ORMGeneratorFactory.getSupportedTargets();
    for (const target of targets) {
      const generator = ORMGeneratorFactory.create(target);
      expect(generator).toBeDefined();
    }
  });

  it('throws for unsupported target', () => {
    expect(() => ORMGeneratorFactory.create('unknown' as any)).toThrow('Unsupported ORM target');
  });

  it('returns supported targets list', () => {
    const targets = ORMGeneratorFactory.getSupportedTargets();
    expect(targets).toContain('prisma');
    expect(targets).toContain('typeorm');
    expect(targets).toContain('sqlalchemy');
    expect(targets).toContain('gorm');
    expect(targets).toContain('jpa');
  });

  it('allows registering custom generator', () => {
    const mockGenerator = ORMGeneratorFactory.create('prisma');
    ORMGeneratorFactory.registerGenerator('custom' as any, mockGenerator);
    expect(ORMGeneratorFactory.create('custom' as any)).toBe(mockGenerator);
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
    const ddl = buildDDL('mysql', '', '', fields);
    expect(ddl).toBe('-- 请填写表名');
  });

  it('returns prompt when no fields', () => {
    const ddl = buildDDL('mysql', 'users', '', []);
    expect(ddl).toBe('-- 请补充字段信息');
  });

  it('generates MySQL CREATE TABLE', () => {
    const ddl = buildDDL('mysql', 'users', '用户表', fields);
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).toContain('id BIGINT AUTO_INCREMENT NOT NULL');
    expect(ddl).toContain('name VARCHAR(255) NOT NULL');
  });

  it('generates PostgreSQL CREATE TABLE', () => {
    const ddl = buildDDL('postgresql', 'users', '用户表', fields);
    expect(ddl).toContain('CREATE TABLE users');
    expect(ddl).toContain('id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL');
    expect(ddl).toContain('name VARCHAR NOT NULL');
  });

  it('includes index DDL', () => {
    const indexes: IndexDefinition[] = [
      {
        name: 'idx_name',
        fields: [{ name: 'name', direction: 'ASC' }],
        unique: false,
        isPrimary: false,
      },
    ];
    const ddl = buildDDL('mysql', 'users', '', fields, indexes);
    expect(ddl).toContain('CREATE INDEX idx_name ON users (name ASC)');
  });

  it('includes foreign key DDL', () => {
    const fks: ForeignKeyDefinition[] = [
      { name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
    ];
    const ddl = buildDDL(
      'mysql',
      'orders',
      '',
      fields,
      [],
      undefined,
      undefined,
      undefined,
      'compact',
      fks,
    );
    expect(ddl).toContain('ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY');
  });

  it('includes table options for mysql', () => {
    const misc: TableMiscConfig = {
      enabled: true,
      engine: 'InnoDB',
      charset: 'utf8mb4',
      collation: 'utf8mb4_unicode_ci',
    };
    const ddl = buildDDL('mysql', 'users', '', fields, [], undefined, undefined, misc);
    expect(ddl).toContain('ENGINE=InnoDB');
    expect(ddl).toContain('DEFAULT CHARSET=utf8mb4');
    expect(ddl).toContain('COLLATE=utf8mb4_unicode_ci');
  });

  it('includes Citus sharding DDL', () => {
    const ddl = buildDDL('postgresql-citus', 'users', '', fields, [], {
      mode: 'distributed',
      distributionColumn: 'tenant_id',
    });
    expect(ddl).toContain("SELECT create_distributed_table('users', 'tenant_id')");
  });

  it('includes reference table DDL for Citus', () => {
    const ddl = buildDDL('postgresql-citus', 'users', '', fields, [], { mode: 'reference' });
    expect(ddl).toContain("SELECT create_reference_table('users')");
  });

  it('includes Oracle synonyms', () => {
    const ddl = buildDDL('oracle', 'users', '', fields);
    expect(ddl).toContain('CREATE OR REPLACE PUBLIC SYNONYM users FOR users');
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
    expect(buildDCL('mysql', '', ['user1'])).toBe('');
  });

  it('returns empty for empty auth objects', () => {
    expect(buildDCL('mysql', 'users', [])).toBe('');
  });

  it('generates GRANT statements', () => {
    const dcl = buildDCL('mysql', 'users', ['app_user', 'readonly_user']);
    expect(dcl).toBe('GRANT SELECT ON users TO app_user;\nGRANT SELECT ON users TO readonly_user;');
  });

  it('trims auth object names', () => {
    const dcl = buildDCL('mysql', 'users', ['  app_user  ']);
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

describe('TypeMapper', () => {
  it('maps varchar for mysql', () => {
    const mapper = TypeMapper.create('mysql');
    expect(mapper.mapType({ baseType: 'varchar', args: [], unsigned: false, raw: 'varchar' })).toBe(
      'VARCHAR(255)',
    );
  });

  it('maps int for postgresql', () => {
    const mapper = TypeMapper.create('postgresql');
    expect(mapper.mapType({ baseType: 'int', args: [], unsigned: false, raw: 'int' })).toBe(
      'INTEGER',
    );
  });

  it('preserves custom args when provided', () => {
    const mapper = TypeMapper.create('mysql');
    expect(
      mapper.mapType({ baseType: 'varchar', args: ['100'], unsigned: false, raw: 'varchar(100)' }),
    ).toBe('VARCHAR(100)');
  });

  it('adds unsigned suffix for mysql', () => {
    const mapper = TypeMapper.create('mysql');
    expect(mapper.mapType({ baseType: 'int', args: [], unsigned: true, raw: 'int unsigned' })).toBe(
      'INT UNSIGNED',
    );
  });

  it('does not add unsigned for postgresql', () => {
    const mapper = TypeMapper.create('postgresql');
    expect(mapper.mapType({ baseType: 'int', args: [], unsigned: true, raw: 'int unsigned' })).toBe(
      'INTEGER',
    );
  });

  it('returns raw type for unknown mapping', () => {
    const mapper = TypeMapper.create('mysql');
    expect(
      mapper.mapType({ baseType: 'geometry', args: [], unsigned: false, raw: 'geometry' }),
    ).toBe('geometry');
  });

  it('getSupportedTypes returns keys for mapped database', () => {
    const mapper = TypeMapper.create('mysql');
    const types = mapper.getSupportedTypes();
    expect(types).toContain('varchar');
    expect(types).toContain('int');
  });

  it('hasMapping returns true for mapped type', () => {
    const mapper = TypeMapper.create('mysql');
    expect(mapper.hasMapping('varchar')).toBe(true);
    expect(mapper.hasMapping('unknown_type')).toBe(false);
  });

  it('handles serial transform for mysql', () => {
    const mapper = TypeMapper.create('mysql');
    expect(mapper.mapType({ baseType: 'serial', args: [], unsigned: false, raw: 'serial' })).toBe(
      'BIGINT UNSIGNED AUTO_INCREMENT',
    );
  });

  it('handles serial transform for postgresql', () => {
    const mapper = TypeMapper.create('postgresql');
    expect(mapper.mapType({ baseType: 'serial', args: [], unsigned: false, raw: 'serial' })).toBe(
      'SERIAL',
    );
  });

  it('handles serial transform for sqlserver', () => {
    const mapper = TypeMapper.create('sqlserver');
    expect(mapper.mapType({ baseType: 'serial', args: [], unsigned: false, raw: 'serial' })).toBe(
      'BIGINT IDENTITY(1,1)',
    );
  });
});
