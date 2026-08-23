import { describe, expect, it } from 'vitest';
import type {
  NormalizedField,
  DatabaseType,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import type { TableDiff, FieldDiff, IndexDiff, ForeignKeyDiff } from '../utils/tableDiff';
import {
  generateAlterDDL,
  generateRollbackDDL,
  generateTableCommentAlter,
  generateDropColumn,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
  buildDefaultClause,
  generateAddIndex,
  generateDropIndex,
  generateAddForeignKey,
  generateDropForeignKey,
} from '../utils/alter-ddl';
import {
  generateRenameTable,
  generateTableOptionsChangeNotice,
} from '../utils/alter-ddl/tableStatements';

const createField = (overrides: Partial<NormalizedField> = {}): NormalizedField => ({
  name: 'id',
  type: 'int',
  comment: '',
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

const createIndex = (overrides: Partial<IndexDefinition> = {}): IndexDefinition => ({
  name: 'idx_name',
  fields: [{ name: 'name', direction: 'ASC' }],
  unique: false,
  isPrimary: false,
  ...overrides,
});

const createFk = (overrides: Partial<ForeignKeyDefinition> = {}): ForeignKeyDefinition => ({
  name: 'fk_user',
  fields: ['user_id'],
  refTable: 'users',
  refFields: ['id'],
  ...overrides,
});

const createTableDiff = (overrides: Partial<TableDiff> = {}): TableDiff => ({
  hasChanges: true,
  tableNameChanged: false,
  tableCommentChanged: false,
  miscConfigChanged: false,
  fields: [],
  indexes: [],
  foreignKeys: [],
  ...overrides,
});

describe('generateAlterDDL', () => {
  it('returns empty string when no changes', () => {
    const diff = createTableDiff({ hasChanges: false });
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe('');
  });

  it('generates add column statement for mysql', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'add',
          fieldName: 'age',
          newField: createField({ name: 'age', type: 'int', nullable: true }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toContain('ALTER TABLE users ADD COLUMN age INT NULL;');
  });

  it('generates drop column statement for mysql', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'remove',
          fieldName: 'age',
          oldField: createField({ name: 'age', type: 'int' }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users DROP COLUMN age;');
  });

  it('generates rename column statement for mysql', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'rename',
          fieldName: 'new_age',
          oldFieldName: 'age',
          newFieldName: 'new_age',
          oldField: createField({ name: 'age', type: 'int' }),
          newField: createField({ name: 'new_age', type: 'int' }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users RENAME COLUMN age TO new_age;');
  });

  it('applies field property changes after a rename', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'rename',
          fieldName: 'new_age',
          oldFieldName: 'age',
          newFieldName: 'new_age',
          oldField: createField({ name: 'age', type: 'int', nullable: true }),
          newField: createField({ name: 'new_age', type: 'int', nullable: false }),
          changes: ['nullable'],
        },
      ],
    });

    const sql = generateAlterDDL('users', diff, [], 'mysql');

    expect(sql).toBe(
      'ALTER TABLE users RENAME COLUMN age TO new_age;\n\n' +
        'ALTER TABLE users MODIFY COLUMN new_age INT NOT NULL;',
    );
  });

  it('generates modify column statement for mysql', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'modify',
          fieldName: 'age',
          oldField: createField({ name: 'age', type: 'int' }),
          newField: createField({ name: 'age', type: 'bigint' }),
          changes: ['type'],
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users MODIFY COLUMN age BIGINT NOT NULL;');
  });

  it('generates add index statement', () => {
    const diff = createTableDiff({
      indexes: [
        {
          type: 'add',
          index: createIndex({ name: 'idx_age', fields: [{ name: 'age', direction: 'ASC' }] }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('CREATE INDEX idx_age ON users (age ASC);');
  });

  it('generates drop index statement for mysql', () => {
    const diff = createTableDiff({
      indexes: [
        {
          type: 'remove',
          index: createIndex({ name: 'idx_age', fields: [{ name: 'age', direction: 'ASC' }] }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('DROP INDEX idx_age ON users;');
  });

  it('generates drop primary key statement', () => {
    const diff = createTableDiff({
      indexes: [
        {
          type: 'remove',
          index: createIndex({
            name: 'pk_id',
            fields: [{ name: 'id', direction: 'ASC' }],
            isPrimary: true,
          }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users DROP PRIMARY KEY;');
  });

  it('generates add primary key statement', () => {
    const diff = createTableDiff({
      indexes: [
        {
          type: 'add',
          index: createIndex({
            name: 'pk_id',
            fields: [{ name: 'id', direction: 'ASC' }],
            isPrimary: true,
          }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users ADD PRIMARY KEY (id);');
  });

  it('generates add foreign key statement', () => {
    const diff = createTableDiff({
      foreignKeys: [
        {
          type: 'add',
          foreignKey: createFk({ onDelete: 'CASCADE', onUpdate: 'RESTRICT' }),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe(
      'ALTER TABLE users ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE RESTRICT;',
    );
  });

  it('generates drop foreign key statement for mysql', () => {
    const diff = createTableDiff({
      foreignKeys: [
        {
          type: 'remove',
          foreignKey: createFk(),
        },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users DROP FOREIGN KEY fk_user;');
  });

  it('generates table comment alter for mysql', () => {
    const diff = createTableDiff({
      tableCommentChanged: true,
      newTableComment: '用户表',
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    expect(sql).toBe("ALTER TABLE users COMMENT = '用户表';");
  });

  it('generates table comment alter for postgresql', () => {
    const diff = createTableDiff({
      tableCommentChanged: true,
      newTableComment: '用户表',
    });
    const sql = generateAlterDDL('users', diff, [], 'postgresql');
    expect(sql).toBe("COMMENT ON TABLE users IS '用户表';");
  });

  it('renames the table before applying changes to its new name', () => {
    const diff = createTableDiff({
      tableNameChanged: true,
      oldTableName: 'users',
      newTableName: 'accounts',
      fields: [
        {
          type: 'add',
          fieldName: 'age',
          newField: createField({ name: 'age', type: 'int' }),
        },
      ],
    });

    const sql = generateAlterDDL('accounts', diff, [], 'mysql');

    expect(sql).toBe(
      'ALTER TABLE users RENAME TO accounts;\n\n' +
        'ALTER TABLE accounts ADD COLUMN age INT NOT NULL;',
    );
  });

  it('emits an explicit notice for table options that need manual migration', () => {
    const diff = createTableDiff({ miscConfigChanged: true });

    expect(generateAlterDDL('users', diff, [], 'hive')).toBe(
      '-- Manual migration required: table options changed for users (hive).',
    );
  });

  it('processes multiple changes in correct order', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'remove',
          fieldName: 'old_col',
          oldField: createField({ name: 'old_col', type: 'int' }),
        },
        {
          type: 'add',
          fieldName: 'new_col',
          newField: createField({ name: 'new_col', type: 'varchar', nullable: true }),
        },
      ],
      indexes: [
        { type: 'remove', index: createIndex({ name: 'idx_old' }) },
        { type: 'add', index: createIndex({ name: 'idx_new' }) },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    const lines = sql.split('\n\n');
    expect(lines[0]).toBe('DROP INDEX idx_old ON users;');
    expect(lines[1]).toBe('ALTER TABLE users DROP COLUMN old_col;');
    expect(lines[2]).toBe('ALTER TABLE users ADD COLUMN new_col VARCHAR(255) NULL;');
    expect(lines[3]).toBe('CREATE INDEX idx_new ON users (name ASC);');
  });
});

describe('generateRollbackDDL', () => {
  it('returns empty string when no changes', () => {
    const diff = createTableDiff({ hasChanges: false });
    expect(generateRollbackDDL('users', diff, [], 'mysql')).toBe('');
  });

  it('rollback: delete added index', () => {
    const diff = createTableDiff({
      indexes: [{ type: 'add', index: createIndex({ name: 'idx_age' }) }],
    });
    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    expect(sql).toBe('DROP INDEX idx_age ON users;');
  });

  it('rollback: restore modified field', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'modify',
          fieldName: 'age',
          oldField: createField({ name: 'age', type: 'int' }),
          newField: createField({ name: 'age', type: 'bigint' }),
          changes: ['type'],
        },
      ],
    });
    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users MODIFY COLUMN age INT NOT NULL;');
  });

  it('rollback: delete added field', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'add',
          fieldName: 'age',
          newField: createField({ name: 'age', type: 'int' }),
        },
      ],
    });
    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users DROP COLUMN age;');
  });

  it('rollback: reverse renamed field', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'rename',
          fieldName: 'new_age',
          oldFieldName: 'age',
          newFieldName: 'new_age',
          oldField: createField({ name: 'age', type: 'int' }),
          newField: createField({ name: 'new_age', type: 'int' }),
        },
      ],
    });
    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users RENAME COLUMN new_age TO age;');
  });

  it('rollback: restores field properties before reversing a rename', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'rename',
          fieldName: 'new_age',
          oldFieldName: 'age',
          newFieldName: 'new_age',
          oldField: createField({ name: 'age', type: 'int', nullable: true }),
          newField: createField({ name: 'new_age', type: 'int', nullable: false }),
          changes: ['nullable'],
        },
      ],
    });

    const sql = generateRollbackDDL('users', diff, [], 'mysql');

    expect(sql).toBe(
      'ALTER TABLE users MODIFY COLUMN new_age INT NULL;\n\n' +
        'ALTER TABLE users RENAME COLUMN new_age TO age;',
    );
  });

  it('rollback: restore removed field', () => {
    const diff = createTableDiff({
      fields: [
        {
          type: 'remove',
          fieldName: 'age',
          oldField: createField({ name: 'age', type: 'int', nullable: true }),
        },
      ],
    });
    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    expect(sql).toBe('ALTER TABLE users ADD COLUMN age INT NULL;');
  });

  it('rollback: restore removed index', () => {
    const diff = createTableDiff({
      indexes: [{ type: 'remove', index: createIndex({ name: 'idx_age' }) }],
    });
    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    expect(sql).toBe('CREATE INDEX idx_age ON users (name ASC);');
  });

  it('rollback: restore old table comment', () => {
    const diff = createTableDiff({
      tableCommentChanged: true,
      oldTableComment: '旧注释',
      newTableComment: '新注释',
    });
    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    expect(sql).toBe("ALTER TABLE users COMMENT = '旧注释';");
  });

  it('rollback: reverses other changes before restoring the old table name', () => {
    const diff = createTableDiff({
      tableNameChanged: true,
      oldTableName: 'users',
      newTableName: 'accounts',
      fields: [
        {
          type: 'add',
          fieldName: 'age',
          newField: createField({ name: 'age', type: 'int' }),
        },
      ],
    });

    const sql = generateRollbackDDL('accounts', diff, [], 'mysql');

    expect(sql).toBe(
      'ALTER TABLE accounts DROP COLUMN age;\n\n' + 'ALTER TABLE accounts RENAME TO users;',
    );
  });

  it('rollback: keeps table option changes visible', () => {
    const diff = createTableDiff({ miscConfigChanged: true });

    expect(generateRollbackDDL('users', diff, [], 'postgresql')).toBe(
      '-- Manual migration required: table options changed for users (postgresql).',
    );
  });
});

describe('table statements', () => {
  it('uses sp_rename for SQL Server table renames', () => {
    expect(generateRenameTable("old'users", "new'users", 'sqlserver')).toBe(
      "EXEC sp_rename 'old''users', 'new''users';",
    );
  });

  it('describes manual table option migrations', () => {
    expect(generateTableOptionsChangeNotice('users', 'mysql')).toContain('users (mysql)');
  });
});

describe('generateTableCommentAlter', () => {
  const cases: Array<{ db: DatabaseType; expected: string }> = [
    { db: 'mysql', expected: "ALTER TABLE t COMMENT = '注释';" },
    { db: 'mariadb', expected: "ALTER TABLE t COMMENT = '注释';" },
    { db: 'tidb', expected: "ALTER TABLE t COMMENT = '注释';" },
    { db: 'postgresql', expected: "COMMENT ON TABLE t IS '注释';" },
    { db: 'sqlserver', expected: '-- 请使用 sp_updateextendedproperty 更新表注释' },
    { db: 'oracle', expected: "COMMENT ON TABLE t IS '注释';" },
    { db: 'dm', expected: "COMMENT ON TABLE t IS '注释';" },
  ];

  for (const { db, expected } of cases) {
    it(`handles ${db}`, () => {
      expect(generateTableCommentAlter('t', '注释', db)).toBe(expected);
    });
  }

  it('escapes single quotes', () => {
    expect(generateTableCommentAlter('t', "it's", 'mysql')).toBe(
      "ALTER TABLE t COMMENT = 'it''s';",
    );
  });

  it('returns empty for unsupported db', () => {
    expect(generateTableCommentAlter('t', '注释', 'hive' as DatabaseType)).toBe('');
  });
});

describe('generateDropColumn', () => {
  const dbs: DatabaseType[] = ['mysql', 'postgresql', 'sqlserver', 'oracle', 'dm'];
  for (const db of dbs) {
    it(`generates correct SQL for ${db}`, () => {
      const diff: FieldDiff = { type: 'remove', fieldName: 'age' };
      expect(generateDropColumn('users', diff, db)).toBe('ALTER TABLE users DROP COLUMN age;');
    });
  }
});

describe('generateRenameColumn', () => {
  it('returns empty when names are missing', () => {
    const diff: FieldDiff = { type: 'rename', fieldName: 'a' };
    expect(generateRenameColumn('users', diff, 'mysql')).toBe('');
  });

  it('generates MySQL style rename', () => {
    const diff: FieldDiff = {
      type: 'rename',
      fieldName: 'new_age',
      oldFieldName: 'age',
      newFieldName: 'new_age',
    };
    expect(generateRenameColumn('users', diff, 'mysql')).toBe(
      'ALTER TABLE users RENAME COLUMN age TO new_age;',
    );
  });

  it('generates SQL Server sp_rename', () => {
    const diff: FieldDiff = {
      type: 'rename',
      fieldName: 'new_age',
      oldFieldName: 'age',
      newFieldName: 'new_age',
    };
    expect(generateRenameColumn('users', diff, 'sqlserver')).toBe(
      "EXEC sp_rename 'users.age', 'new_age', 'COLUMN';",
    );
  });
});

describe('generateAddColumn', () => {
  it('returns empty when newField is missing', () => {
    const diff: FieldDiff = { type: 'add', fieldName: 'age' };
    expect(generateAddColumn('users', diff, 'mysql')).toBe('');
  });

  it('generates MySQL add column', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'age',
      newField: createField({ name: 'age', type: 'int', nullable: true }),
    };
    expect(generateAddColumn('users', diff, 'mysql')).toBe(
      'ALTER TABLE users ADD COLUMN age INT NULL;',
    );
  });

  it('generates SQL Server add column without COLUMN keyword', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'age',
      newField: createField({ name: 'age', type: 'int', nullable: true }),
    };
    expect(generateAddColumn('users', diff, 'sqlserver')).toBe(
      'ALTER TABLE users ADD age INT NULL;',
    );
  });

  it('generates Oracle add column with parentheses', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'age',
      newField: createField({ name: 'age', type: 'int', nullable: true }),
    };
    expect(generateAddColumn('users', diff, 'oracle')).toBe(
      'ALTER TABLE users ADD (age NUMBER(10));',
    );
  });

  it('includes auto_increment for mysql', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'id',
      newField: createField({ name: 'id', type: 'bigint', defaultKind: 'auto_increment' }),
    };
    expect(generateAddColumn('users', diff, 'mysql')).toBe(
      'ALTER TABLE users ADD COLUMN id BIGINT AUTO_INCREMENT NOT NULL;',
    );
  });

  it('includes default clause', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'status',
      newField: createField({
        name: 'status',
        type: 'varchar',
        defaultKind: 'constant',
        defaultValue: 'active',
      }),
    };
    expect(generateAddColumn('users', diff, 'mysql')).toBe(
      "ALTER TABLE users ADD COLUMN status VARCHAR(255) NOT NULL DEFAULT 'active';",
    );
  });

  it('includes comment for mysql', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'age',
      newField: createField({ name: 'age', type: 'int', comment: '年龄' }),
    };
    expect(generateAddColumn('users', diff, 'mysql')).toBe(
      "ALTER TABLE users ADD COLUMN age INT NOT NULL COMMENT '年龄';",
    );
  });

  it('includes on update for mysql timestamp', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'updated_at',
      newField: createField({
        name: 'updated_at',
        type: 'timestamp',
        onUpdate: 'current_timestamp',
      }),
    };
    expect(generateAddColumn('users', diff, 'mysql')).toBe(
      'ALTER TABLE users ADD COLUMN updated_at TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP;',
    );
  });
});

describe('generateModifyColumn', () => {
  it('returns empty when newField is missing', () => {
    const diff: FieldDiff = { type: 'modify', fieldName: 'age' };
    expect(generateModifyColumn('users', diff, 'mysql')).toBe('');
  });

  it('generates MySQL modify column', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'age',
      newField: createField({ name: 'age', type: 'bigint' }),
    };
    expect(generateModifyColumn('users', diff, 'mysql')).toBe(
      'ALTER TABLE users MODIFY COLUMN age BIGINT NOT NULL;',
    );
  });

  it('generates SQL Server alter column', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'age',
      newField: createField({ name: 'age', type: 'bigint' }),
    };
    expect(generateModifyColumn('users', diff, 'sqlserver')).toBe(
      'ALTER TABLE users ALTER COLUMN age BIGINT NOT NULL;',
    );
  });

  it('generates Oracle modify with parentheses', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'age',
      newField: createField({ name: 'age', type: 'bigint' }),
    };
    expect(generateModifyColumn('users', diff, 'oracle')).toBe(
      'ALTER TABLE users MODIFY (age NUMBER(19) NOT NULL);',
    );
  });

  it('generates PostgreSQL multi-statement modify for type change', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'age',
      oldField: createField({ name: 'age', type: 'int' }),
      newField: createField({ name: 'age', type: 'bigint' }),
      changes: ['type'],
    };
    const sql = generateModifyColumn('users', diff, 'postgresql');
    expect(sql).toBe('ALTER TABLE users ALTER COLUMN age TYPE BIGINT;');
  });

  it('generates PostgreSQL multi-statement modify for nullable', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'age',
      oldField: createField({ name: 'age', type: 'int', nullable: false }),
      newField: createField({ name: 'age', type: 'int', nullable: true }),
      changes: ['nullable'],
    };
    const sql = generateModifyColumn('users', diff, 'postgresql');
    expect(sql).toBe('ALTER TABLE users ALTER COLUMN age DROP NOT NULL;');
  });

  it('generates PostgreSQL multi-statement modify for default', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'status',
      oldField: createField({ name: 'status', type: 'varchar' }),
      newField: createField({
        name: 'status',
        type: 'varchar',
        defaultKind: 'constant',
        defaultValue: 'active',
      }),
      changes: ['default'],
    };
    const sql = generateModifyColumn('users', diff, 'postgresql');
    expect(sql).toBe("ALTER TABLE users ALTER COLUMN status SET DEFAULT 'active';");
  });

  it('generates PostgreSQL drop default when default is removed', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'status',
      oldField: createField({
        name: 'status',
        type: 'varchar',
        defaultKind: 'constant',
        defaultValue: 'active',
      }),
      newField: createField({ name: 'status', type: 'varchar' }),
      changes: ['default'],
    };
    const sql = generateModifyColumn('users', diff, 'postgresql');
    expect(sql).toBe('ALTER TABLE users ALTER COLUMN status DROP DEFAULT;');
  });

  it('generates PostgreSQL comment statement', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'age',
      oldField: createField({ name: 'age', type: 'int', comment: '' }),
      newField: createField({ name: 'age', type: 'int', comment: '年龄' }),
      changes: ['comment'],
    };
    const sql = generateModifyColumn('users', diff, 'postgresql');
    expect(sql).toBe("COMMENT ON COLUMN users.age IS '年龄';");
  });

  it('generates combined PostgreSQL modify statements', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'age',
      oldField: createField({ name: 'age', type: 'int', nullable: false }),
      newField: createField({ name: 'age', type: 'bigint', nullable: true }),
      changes: ['type', 'nullable'],
    };
    const sql = generateModifyColumn('users', diff, 'postgresql');
    expect(sql).toBe(
      'ALTER TABLE users ALTER COLUMN age TYPE BIGINT;\nALTER TABLE users ALTER COLUMN age DROP NOT NULL;',
    );
  });
});

describe('buildDefaultClause', () => {
  it('returns empty for none defaultKind', () => {
    expect(buildDefaultClause(createField({ defaultKind: 'none' }), 'mysql')).toBe('');
  });

  it('formats constant default with quotes for string', () => {
    expect(
      buildDefaultClause(
        createField({ defaultKind: 'constant', defaultValue: 'active', type: 'varchar' }),
        'mysql',
      ),
    ).toBe("DEFAULT 'active'");
  });

  it('formats constant default without quotes for numeric', () => {
    expect(
      buildDefaultClause(
        createField({ defaultKind: 'constant', defaultValue: '0', type: 'int' }),
        'mysql',
      ),
    ).toBe('DEFAULT 0');
  });

  it('formats uuid default for mysql', () => {
    expect(buildDefaultClause(createField({ defaultKind: 'uuid', type: 'varchar' }), 'mysql')).toBe(
      'DEFAULT (UUID())',
    );
  });

  it('formats uuid default for postgresql', () => {
    expect(
      buildDefaultClause(createField({ defaultKind: 'uuid', type: 'varchar' }), 'postgresql'),
    ).toBe('DEFAULT gen_random_uuid()');
  });

  it('formats current_timestamp for mysql', () => {
    expect(
      buildDefaultClause(
        createField({ defaultKind: 'current_timestamp', type: 'timestamp' }),
        'mysql',
      ),
    ).toBe('DEFAULT CURRENT_TIMESTAMP');
  });

  it('formats current_timestamp for sqlserver', () => {
    expect(
      buildDefaultClause(
        createField({ defaultKind: 'current_timestamp', type: 'datetime' }),
        'sqlserver',
      ),
    ).toBe('DEFAULT GETDATE()');
  });

  it('uses the configured family defaults for compatible databases', () => {
    expect(
      buildDefaultClause(createField({ defaultKind: 'uuid', type: 'varchar' }), 'oceanbase'),
    ).toBe('DEFAULT (UUID())');
    expect(buildDefaultClause(createField({ defaultKind: 'uuid', type: 'uuid' }), 'kingbase')).toBe(
      'DEFAULT gen_random_uuid()',
    );
    expect(
      buildDefaultClause(
        createField({ defaultKind: 'current_timestamp', type: 'timestamp' }),
        'oracle',
      ),
    ).toBe('DEFAULT SYSTIMESTAMP');
  });

  it('uses the configured identity clause for compatible databases', () => {
    const diff: FieldDiff = {
      type: 'add',
      fieldName: 'id',
      newField: createField({ name: 'id', type: 'int', defaultKind: 'auto_increment' }),
    };

    expect(generateAddColumn('users', diff, 'oceanbase')).toContain('INT AUTO_INCREMENT NOT NULL');
    expect(generateAddColumn('users', diff, 'gbase')).toContain('INT AUTO_INCREMENT NOT NULL');
  });

  it('returns empty for unsupported default on type', () => {
    expect(buildDefaultClause(createField({ defaultKind: 'uuid', type: 'int' }), 'mysql')).toBe('');
  });
});

describe('generateDropIndex', () => {
  it('drops primary key for mysql', () => {
    const diff: IndexDiff = {
      type: 'remove',
      index: createIndex({
        name: 'pk_id',
        isPrimary: true,
        fields: [{ name: 'id', direction: 'ASC' }],
      }),
    };
    expect(generateDropIndex('users', diff, 'mysql')).toBe('ALTER TABLE users DROP PRIMARY KEY;');
  });

  it('drops primary key constraint for postgresql', () => {
    const diff: IndexDiff = {
      type: 'remove',
      index: createIndex({
        name: 'pk_id',
        isPrimary: true,
        fields: [{ name: 'id', direction: 'ASC' }],
      }),
    };
    expect(generateDropIndex('users', diff, 'postgresql')).toBe(
      'ALTER TABLE users DROP CONSTRAINT pk_id;',
    );
  });

  it('drops regular index for mysql', () => {
    const diff: IndexDiff = {
      type: 'remove',
      index: createIndex({ name: 'idx_age' }),
    };
    expect(generateDropIndex('users', diff, 'mysql')).toBe('DROP INDEX idx_age ON users;');
  });

  it('drops regular index for postgresql', () => {
    const diff: IndexDiff = {
      type: 'remove',
      index: createIndex({ name: 'idx_age' }),
    };
    expect(generateDropIndex('users', diff, 'postgresql')).toBe('DROP INDEX idx_age;');
  });
});

describe('generateAddIndex', () => {
  it('adds primary key for mysql', () => {
    const diff: IndexDiff = {
      type: 'add',
      index: createIndex({
        name: 'pk_id',
        isPrimary: true,
        fields: [
          { name: 'id', direction: 'ASC' },
          { name: 'org_id', direction: 'DESC' },
        ],
      }),
    };
    expect(generateAddIndex('users', diff, 'mysql')).toBe(
      'ALTER TABLE users ADD PRIMARY KEY (id, org_id);',
    );
  });

  it('adds primary key constraint for postgresql', () => {
    const diff: IndexDiff = {
      type: 'add',
      index: createIndex({
        name: 'pk_id',
        isPrimary: true,
        fields: [{ name: 'id', direction: 'ASC' }],
      }),
    };
    expect(generateAddIndex('users', diff, 'postgresql')).toBe(
      'ALTER TABLE users ADD CONSTRAINT pk_id PRIMARY KEY (id);',
    );
  });

  it('creates unique index', () => {
    const diff: IndexDiff = {
      type: 'add',
      index: createIndex({
        name: 'uk_email',
        unique: true,
        fields: [{ name: 'email', direction: 'ASC' }],
      }),
    };
    expect(generateAddIndex('users', diff, 'mysql')).toBe(
      'CREATE UNIQUE INDEX uk_email ON users (email ASC);',
    );
  });

  it('creates regular index with multiple fields', () => {
    const diff: IndexDiff = {
      type: 'add',
      index: createIndex({
        name: 'idx_name_age',
        fields: [
          { name: 'name', direction: 'ASC' },
          { name: 'age', direction: 'DESC' },
        ],
      }),
    };
    expect(generateAddIndex('users', diff, 'mysql')).toBe(
      'CREATE INDEX idx_name_age ON users (name ASC, age DESC);',
    );
  });
});

describe('generateDropForeignKey', () => {
  it('drops foreign key for mysql', () => {
    const diff: ForeignKeyDiff = { type: 'remove', foreignKey: createFk() };
    expect(generateDropForeignKey('orders', diff, 'mysql')).toBe(
      'ALTER TABLE orders DROP FOREIGN KEY fk_user;',
    );
  });

  it('drops constraint for postgresql', () => {
    const diff: ForeignKeyDiff = { type: 'remove', foreignKey: createFk() };
    expect(generateDropForeignKey('orders', diff, 'postgresql')).toBe(
      'ALTER TABLE orders DROP CONSTRAINT fk_user;',
    );
  });

  it('drops constraint for sqlserver', () => {
    const diff: ForeignKeyDiff = { type: 'remove', foreignKey: createFk() };
    expect(generateDropForeignKey('orders', diff, 'sqlserver')).toBe(
      'ALTER TABLE orders DROP CONSTRAINT fk_user;',
    );
  });

  it('drops foreign key for gbase', () => {
    const diff: ForeignKeyDiff = { type: 'remove', foreignKey: createFk() };
    expect(generateDropForeignKey('orders', diff, 'gbase')).toBe(
      'ALTER TABLE orders DROP FOREIGN KEY fk_user;',
    );
  });
});

describe('generateAddForeignKey', () => {
  it('adds foreign key without actions', () => {
    const diff: ForeignKeyDiff = {
      type: 'add',
      foreignKey: createFk({ onDelete: undefined, onUpdate: undefined }),
    };
    expect(generateAddForeignKey('orders', diff, 'mysql')).toBe(
      'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id);',
    );
  });

  it('adds foreign key with schema-qualified ref table', () => {
    const diff: ForeignKeyDiff = {
      type: 'add',
      foreignKey: createFk({ refSchema: 'public', refTable: 'users' }),
    };
    expect(generateAddForeignKey('orders', diff, 'postgresql')).toBe(
      'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES public.users (id);',
    );
  });

  it('adds foreign key with onDelete and onUpdate', () => {
    const diff: ForeignKeyDiff = {
      type: 'add',
      foreignKey: createFk({ onDelete: 'SET NULL', onUpdate: 'CASCADE' }),
    };
    expect(generateAddForeignKey('orders', diff, 'mysql')).toBe(
      'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE;',
    );
  });

  it('adds composite foreign key', () => {
    const diff: ForeignKeyDiff = {
      type: 'add',
      foreignKey: createFk({
        fields: ['user_id', 'org_id'],
        refFields: ['id', 'org_id'],
      }),
    };
    expect(generateAddForeignKey('orders', diff, 'mysql')).toBe(
      'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id, org_id) REFERENCES users (id, org_id);',
    );
  });
});
