import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { SqlParser } from '../parser/SqlParser';
import type {
  NormalizedField,
  DatabaseType,
  IndexDefinition,
  ForeignKeyDefinition,
  PersistedState,
} from '@ddlbuilder/shared-types';
import { diffPersistedState } from '../utils/tableDiff';
import { buildDDL } from '../utils/ddlGenerators';
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

const createRename = (oldFieldName: string, newFieldName: string): FieldDiff => ({
  type: 'rename',
  fieldName: newFieldName,
  oldFieldName,
  newFieldName,
  oldField: createField({ name: oldFieldName }),
  newField: createField({ name: newFieldName }),
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
  it.each([
    'CREATE TABLE users (email TEXT, CONSTRAINT uq_users_email UNIQUE(email));',
    'CREATE TABLE users (email TEXT CONSTRAINT uq_users_email UNIQUE);',
    'CREATE TABLE users (email TEXT); ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE(email);',
  ])('keeps unique constraints distinct from independent indexes: %s', async (sql) => {
    const parsed = await new SqlParser().parseAsync(
      sql + ' CREATE UNIQUE INDEX ix_users_email ON users(email);',
      'postgresql',
    );
    const before = withDefaultEditorSession({
      dbType: 'postgresql',
      schemaName: '',
      tableName: parsed.tableName,
      tableComment: '',
      rows: [],
      indexes: parsed.indexes,
      authInput: '',
      authObjects: [],
    });
    const diff = diffPersistedState(before, { ...before, indexes: [] });
    expect(generateAlterDDL('users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE users DROP CONSTRAINT uq_users_email;\n\nDROP INDEX ix_users_email;',
    );
    expect(generateRollbackDDL('users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);\n\nCREATE UNIQUE INDEX ix_users_email ON users (email ASC);',
    );
    expect(
      buildDDL({
        dbType: 'postgresql',
        tableName: 'users',
        tableComment: '',
        fields: parsed.fields,
        indexes: parsed.indexes,
      }),
    ).toContain('ALTER TABLE users ADD CONSTRAINT uq_users_email UNIQUE (email);');
  });

  it('does not drop MySQL unique constraints as PostgreSQL constraints', () => {
    const index = createIndex({ name: 'uq_email', unique: true, isUniqueConstraint: true });
    expect(generateDropIndex('users', { type: 'remove', index }, 'mysql')).toBe(
      'DROP INDEX uq_email ON users;',
    );
  });

  it('detects and reverses PostgreSQL case-only column renames', () => {
    const before = withDefaultEditorSession({
      dbType: 'postgresql',
      schemaName: '',
      tableName: 'users',
      tableComment: '',
      rows: [{ id: 'id', fieldName: 'Id', fieldType: 'int', nullable: true, fieldComment: '' }],
      indexes: [],
      authInput: '',
      authObjects: [],
    });
    const after = { ...before, rows: before.rows.map((row) => ({ ...row, fieldName: 'id' })) };
    const diff = diffPersistedState(before, after);
    expect(generateAlterDDL('users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE users RENAME COLUMN "Id" TO id;',
    );
    expect(generateRollbackDDL('users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE users RENAME COLUMN id TO "Id";',
    );
  });

  it('preserves imported case-sensitive table and column names in both directions', async () => {
    const parsed = await new SqlParser().parseAsync(
      'CREATE TABLE "Audit"."Users" (id INTEGER);',
      'postgresql',
    );
    const before = withDefaultEditorSession({
      schemaName: parsed.schemaName ?? '',
      tableName: parsed.tableName,
      tableComment: '',
      dbType: 'postgresql',
      rows: [],
      indexes: [],
      authInput: '',
      authObjects: [],
    });
    const after = {
      ...before,
      rows: [
        { id: 'tenant', fieldName: 'TenantId', fieldType: 'int', fieldComment: '', nullable: true },
      ],
    };
    const diff = diffPersistedState(before, after);
    expect(generateAlterDDL('Audit.Users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE "Audit"."Users" ADD COLUMN "TenantId" INTEGER;',
    );
    expect(generateRollbackDDL('Audit.Users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE "Audit"."Users" DROP COLUMN "TenantId";',
    );
  });

  it('drops and restores the original imported primary constraint', async () => {
    const parsed = await new SqlParser().parseAsync(
      'CREATE TABLE users (id INT, CONSTRAINT users_identity PRIMARY KEY (id));',
      'postgresql',
    );
    const before = withDefaultEditorSession({
      schemaName: '',
      tableName: parsed.tableName,
      tableComment: '',
      dbType: 'postgresql',
      rows: [],
      indexes: parsed.indexes,
      authInput: '',
      authObjects: [],
    });
    const diff = diffPersistedState(before, { ...before, indexes: [] });
    expect(generateAlterDDL('users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE users DROP CONSTRAINT users_identity;',
    );
    expect(generateRollbackDDL('users', diff, [], 'postgresql')).toBe(
      'ALTER TABLE users ADD CONSTRAINT users_identity PRIMARY KEY (id);',
    );
  });

  it.each([
    [
      'postgresql',
      'ALTER TABLE public.orders SET SCHEMA archive;',
      'ALTER TABLE archive.archived_orders SET SCHEMA public;',
    ],
    [
      'mysql',
      'RENAME TABLE public.orders TO archive.orders;',
      'RENAME TABLE archive.archived_orders TO public.archived_orders;',
    ],
    [
      'sqlserver',
      'ALTER SCHEMA archive TRANSFER public.orders;',
      'ALTER SCHEMA public TRANSFER archive.archived_orders;',
    ],
  ] as const)(
    'moves schemas before renaming or changing fields (%s)',
    (dbType, forwardMove, reverseMove) => {
      const before = {
        schemaName: 'public',
        tableName: 'orders',
        rows: [],
        indexes: [],
      } as unknown as PersistedState;
      const after = {
        ...before,
        schemaName: 'archive',
        tableName: 'archived_orders',
        rows: [{ id: 'field-1', fieldName: 'id', fieldType: 'int', nullable: false }],
      };
      const diff = diffPersistedState(before, after);
      const sql = generateAlterDDL(after.tableName, diff, [], dbType);
      const rollback = generateRollbackDDL(after.tableName, diff, [], dbType);
      expect(sql.startsWith(forwardMove)).toBe(true);
      expect(sql).toContain('ALTER TABLE archive.archived_orders ADD');
      expect(rollback.startsWith(reverseMove)).toBe(true);
      expect(rollback).toContain('ALTER TABLE public.orders DROP COLUMN id;');
    },
  );

  it.each(['oracle', 'postgresql'] as const)(
    'stops automatic changes for unsupported schema moves (%s)',
    (dbType) => {
      const diff = createTableDiff({
        schemaNameChanged: true,
        oldSchemaName: 'public',
        newSchemaName: dbType === 'oracle' ? 'archive' : '',
        fields: [{ type: 'remove', fieldName: 'id' }],
      });
      const sql = generateAlterDDL('orders', diff, [], dbType);
      expect(sql).toContain('Manual migration required: schema change');
      expect(sql).not.toContain('DROP COLUMN');
    },
  );

  it.each([false, true])(
    'keeps the schema through forward and reverse changes (rename=%s)',
    (rename) => {
      const before = {
        schemaName: 'audit',
        tableName: 'orders',
        rows: [],
        indexes: [],
      } as unknown as PersistedState;
      const after = {
        ...before,
        tableName: rename ? 'archived_orders' : 'orders',
        rows: [{ id: 'field-1', fieldName: 'id', fieldType: 'int', nullable: false }],
      };
      const diff = diffPersistedState(before, after);
      const forward = generateAlterDDL(after.tableName, diff, [], 'postgresql');
      const rollback = generateRollbackDDL(after.tableName, diff, [], 'postgresql');

      expect(forward).toContain(
        `ALTER TABLE audit.${after.tableName} ADD COLUMN id INTEGER NOT NULL;`,
      );
      expect(rollback).toContain('ALTER TABLE audit.orders DROP COLUMN id;');
      expect(forward.includes('ALTER TABLE audit.orders RENAME TO archived_orders;')).toBe(rename);
      expect(rollback.includes('ALTER TABLE audit.archived_orders RENAME TO orders;')).toBe(rename);
    },
  );

  it.each(['mysql', 'mariadb', 'tidb', 'oceanbase'] as const)(
    'retains the destination database when renaming a qualified table (%s)',
    (dbType) => {
      const sql = generateRenameTable('audit.orders', 'audit.archived_orders', dbType);
      expect(sql).toBe('ALTER TABLE audit.orders RENAME TO audit.archived_orders;');
    },
  );

  it('qualifies standalone index drops using the table schema', () => {
    const diff = createTableDiff({ indexes: [{ type: 'remove', index: createIndex() }] });
    expect(generateAlterDDL('audit.orders', diff, [], 'postgresql')).toBe(
      'DROP INDEX audit.idx_name;',
    );
  });

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

  it.each([{ order: [0, 1, 2] }, { order: [2, 0, 1] }])(
    'orders rename chains and their rollback independently of diff order ($order)',
    ({ order }) => {
      const renames = [createRename('a', 'b'), createRename('b', 'c'), createRename('c', 'd')];
      const diff = createTableDiff({ fields: order.map((index) => renames[index]) });
      expect(generateAlterDDL('users', diff, [], 'postgresql')).toBe(
        [
          'ALTER TABLE users RENAME COLUMN c TO d;',
          'ALTER TABLE users RENAME COLUMN b TO c;',
          'ALTER TABLE users RENAME COLUMN a TO b;',
        ].join('\n\n'),
      );
      expect(generateRollbackDDL('users', diff, [], 'postgresql')).toBe(
        [
          'ALTER TABLE users RENAME COLUMN b TO a;',
          'ALTER TABLE users RENAME COLUMN c TO b;',
          'ALTER TABLE users RENAME COLUMN d TO c;',
        ].join('\n\n'),
      );
    },
  );

  it('changes column properties only after freeing the rename target', () => {
    const diff = createTableDiff({
      fields: [
        {
          ...createRename('a', 'b'),
          changes: ['nullable'],
          oldField: createField({ name: 'a', nullable: true }),
        },
        createRename('b', 'c'),
      ],
    });
    expect(generateAlterDDL('users', diff, [], 'postgresql')).toBe(
      [
        'ALTER TABLE users RENAME COLUMN b TO c;',
        'ALTER TABLE users RENAME COLUMN a TO b;',
        'ALTER TABLE users ALTER COLUMN b SET NOT NULL;',
      ].join('\n\n'),
    );
  });

  it.each([
    { cycle: [createRename('a', 'b'), createRename('b', 'a')] },
    { cycle: [createRename('a', 'b'), createRename('b', 'c'), createRename('c', 'a')] },
  ])(
    'does not emit partial migrations when column renames form a cycle ($cycle.length)',
    ({ cycle }) => {
      const diff = createTableDiff({
        tableNameChanged: true,
        oldTableName: 'users',
        newTableName: 'renamed_users',
        fields: [...cycle, createRename('x', 'y'), { type: 'remove', fieldName: 'obsolete' }],
        indexes: [{ type: 'remove', index: createIndex() }],
      });
      expect(generateAlterDDL('renamed_users', diff, [], 'postgresql')).toBe(
        '-- Manual migration required: cyclic column renames in users (postgresql). No automatic changes generated.',
      );
      expect(generateRollbackDDL('renamed_users', diff, [], 'postgresql')).toBe(
        '-- Manual migration required: cyclic column renames in renamed_users (postgresql). No automatic changes generated.',
      );
    },
  );

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
        {
          type: 'remove',
          index: createIndex({ name: 'idx_old', fields: [{ name: 'old_col', direction: 'ASC' }] }),
        },
        {
          type: 'add',
          index: createIndex({ name: 'idx_new', fields: [{ name: 'new_col', direction: 'ASC' }] }),
        },
      ],
      foreignKeys: [
        { type: 'remove', foreignKey: createFk({ fields: ['old_col'] }) },
        { type: 'add', foreignKey: createFk({ fields: ['new_col'] }) },
      ],
    });
    const sql = generateAlterDDL('users', diff, [], 'mysql');
    const lines = sql.split('\n\n');
    expect(lines).toEqual([
      'ALTER TABLE users DROP FOREIGN KEY fk_user;',
      'DROP INDEX idx_old ON users;',
      'ALTER TABLE users DROP COLUMN old_col;',
      'ALTER TABLE users ADD COLUMN new_col VARCHAR(255) NULL;',
      'CREATE INDEX idx_new ON users (new_col ASC);',
      'ALTER TABLE users ADD CONSTRAINT fk_user FOREIGN KEY (new_col) REFERENCES users (id);',
    ]);
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

  it('rollback: restores field properties after reversing a rename', () => {
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
      'ALTER TABLE users RENAME COLUMN new_age TO age;\n\n' +
        'ALTER TABLE users MODIFY COLUMN age INT NULL;',
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

  it('rollback: restores the table name before applying the reversed changes', () => {
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
      'ALTER TABLE accounts RENAME TO users;\n\n' + 'ALTER TABLE users DROP COLUMN age;',
    );
  });

  it.each(['add', 'remove'] as const)('rollback: reverses a foreign key %s', (type) => {
    const diff = createTableDiff({
      foreignKeys: [{ type, foreignKey: createFk({ onDelete: 'CASCADE' }) }],
    });

    expect(generateRollbackDDL('orders', diff, [], 'mysql')).toBe(
      type === 'add'
        ? 'ALTER TABLE orders DROP FOREIGN KEY fk_user;'
        : 'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE;',
    );
  });

  it('rollback: removes and restores foreign keys in dependency order', () => {
    const diff = createTableDiff({
      fields: [
        { type: 'add', fieldName: 'user_id', newField: createField({ name: 'user_id' }) },
        { type: 'remove', fieldName: 'owner_id', oldField: createField({ name: 'owner_id' }) },
      ],
      indexes: [
        {
          type: 'add',
          index: createIndex({ name: 'idx_user', fields: [{ name: 'user_id', direction: 'ASC' }] }),
        },
        {
          type: 'remove',
          index: createIndex({
            name: 'idx_owner',
            fields: [{ name: 'owner_id', direction: 'ASC' }],
          }),
        },
      ],
      foreignKeys: [
        { type: 'add', foreignKey: createFk() },
        { type: 'remove', foreignKey: createFk({ name: 'fk_owner', fields: ['owner_id'] }) },
      ],
    });

    expect(generateRollbackDDL('orders', diff, [], 'mysql').split('\n\n')).toEqual([
      'ALTER TABLE orders DROP FOREIGN KEY fk_user;',
      'DROP INDEX idx_user ON orders;',
      'ALTER TABLE orders DROP COLUMN user_id;',
      'ALTER TABLE orders ADD COLUMN owner_id INT NOT NULL;',
      'CREATE INDEX idx_owner ON orders (owner_id ASC);',
      'ALTER TABLE orders ADD CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users (id);',
    ]);
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
  it.each(['', '   ', 'now()', 'current_timestamp', "O'Reilly"])(
    'keeps the text constant %j literal',
    (value) => {
      expect(
        buildDefaultClause(
          createField({ type: 'text', defaultKind: 'constant', defaultValue: value }),
          'postgresql',
        ),
      ).toBe(`DEFAULT '${value.replace(/'/g, "''")}'`);
    },
  );

  it('emits SQL only for explicit expression defaults', () => {
    expect(
      buildDefaultClause(
        createField({ type: 'text', defaultKind: 'expression', defaultValue: "lower('HELLO')" }),
        'postgresql',
      ),
    ).toBe("DEFAULT lower('HELLO')");
  });

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
