import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession } from '@ddlbuilder/shared-types';
import { SqlParser } from '../parser/SqlParser';
import type {
  NormalizedField,
  DatabaseType,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { diffPersistedState } from '../utils/tableDiff';
import { buildDDL } from '../utils/ddlGenerators';
import { buildDialectDefaultClause } from '../strategies/dialectColumn';
import type { TableDiff, FieldDiff, ForeignKeyDiff, RenameFieldDiff } from '../utils/tableDiff';
import {
  generateAlterDDL,
  generateRollbackDDL,
  generateTableCommentAlter,
  generateRenameColumn,
  generateAddColumn,
  generateModifyColumn,
  generateDropIndex,
  generateAddForeignKey,
} from '../utils/alter-ddl';
import { generateRenameTable } from '../utils/alter-ddl/tableStatements';

const dependencyNotice =
  '-- Manual migration required for foreign keys from other tables that reference changed columns or keys. Their definitions are not available in this single-table diff; coordinate those changes before running this SQL.\n\n';

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
  id: 'index',
  name: 'idx_name',
  fields: [{ name: 'name', direction: 'ASC' }],
  kind: 'index',

  ...overrides,
});

const createFk = (overrides: Partial<ForeignKeyDefinition> = {}): ForeignKeyDefinition => ({
  id: 'foreign-key',
  name: 'fk_user',
  fields: ['user_id'],
  refTable: 'users',
  refFields: ['id'],
  ...overrides,
});

const createRename = (oldFieldName: string, newFieldName: string): RenameFieldDiff => ({
  type: 'rename',
  fieldName: newFieldName,
  oldFieldName,
  newFieldName,
  oldField: createField({ name: oldFieldName }),
  newField: createField({ name: newFieldName }),
});

const createTableDiff = (
  overrides: Partial<TableDiff> = {},
  dbType: DatabaseType = 'mysql',
  tableName = 'users',
  schemaName = '',
): TableDiff => ({
  oldDbType: dbType,
  newDbType: dbType,
  tableNameChanged: false,
  oldTableName: tableName,
  newTableName: tableName,
  oldSchemaName: schemaName,
  newSchemaName: schemaName,
  tableCommentChanged: false,
  miscConfigChanged: false,
  fields: [],
  indexes: [],
  foreignKeys: [],
  ...overrides,
});

describe('generateAlterDDL', () => {
  it('reports Hive column changes instead of emitting unsupported ALTER syntax', () => {
    const diff = createTableDiff(
      {
        fields: [
          { type: 'add', fieldName: 'email', newField: createField({ name: 'email' }) },
          { type: 'remove', fieldName: 'age', oldField: createField({ name: 'age' }) },
          {
            type: 'modify',
            fieldName: 'name',
            oldField: createField({ name: 'name' }),
            newField: createField({ name: 'name', type: 'bigint' }),
            changes: ['type'],
          },
          createRename('nick', 'nickname'),
        ],
      },
      'hive',
    );

    expect(generateAlterDDL(diff)).toBe(
      dependencyNotice +
        [
          '-- Manual migration required: drop column age on users (hive).',
          '-- Manual migration required: rename column nick to nickname on users (hive).',
          '-- Manual migration required: add column email on users (hive).',
          '-- Manual migration required: modify column name on users (hive).',
        ].join('\n\n'),
    );
    expect(generateRollbackDDL(diff)).not.toMatch(/^ALTER TABLE/m);
  });

  it.each(['kingbase'] as const)(
    '%s drops and restores indexes and comments using PostgreSQL syntax',
    (dbType) => {
      const primary = createIndex({ name: 'users_pkey', kind: 'primary' });
      const index = createIndex();

      const diff = createTableDiff(
        {
          oldSchemaName: 'audit',
          newSchemaName: 'audit',
          tableCommentChanged: true,
          oldTableComment: 'before',
          newTableComment: "it's new",
          indexes: [
            { type: 'remove', index: primary },
            { type: 'remove', index },
          ],
        },
        dbType,
      );
      expect(generateAlterDDL(diff)).toBe(
        dependencyNotice +
          "COMMENT ON TABLE audit.users IS 'it''s new';\n\nALTER TABLE audit.users DROP CONSTRAINT users_pkey;\n\nDROP INDEX audit.idx_name;",
      );
      expect(generateRollbackDDL(diff)).toBe(
        "COMMENT ON TABLE audit.users IS 'before';\n\nALTER TABLE audit.users ADD CONSTRAINT users_pkey PRIMARY KEY (name);\n\nCREATE INDEX idx_name ON audit.users (name ASC);",
      );
    },
  );

  it.each(['mariadb'] as const)(
    '%s retains MySQL syntax for primary keys, indexes and comments',
    (dbType) => {
      const overrides: Partial<TableDiff> = {
        tableCommentChanged: true,
        oldTableComment: 'before',
        newTableComment: 'after',
        indexes: [
          {
            type: 'remove',
            index: createIndex({ name: 'PRIMARY', kind: 'primary' }),
          },
          { type: 'remove', index: createIndex() },
        ],
      };
      const diff = createTableDiff(overrides, dbType);
      const mysqlDiff = createTableDiff(overrides);
      expect(generateAlterDDL(diff)).toBe(generateAlterDDL(mysqlDiff));
      expect(generateRollbackDDL(diff)).toBe(generateRollbackDDL(mysqlDiff));
    },
  );

  it.each(['CREATE TABLE users (email TEXT, CONSTRAINT uq_users_email UNIQUE(email));'])(
    'keeps unique constraints distinct from independent indexes: %s',
    async (sql) => {
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
      expect(generateAlterDDL(diff)).toBe(
        dependencyNotice +
          'ALTER TABLE users DROP CONSTRAINT uq_users_email;\n\nDROP INDEX ix_users_email;',
      );
      expect(generateRollbackDDL(diff)).toBe(
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
    },
  );

  it('does not drop MySQL unique constraints as PostgreSQL constraints', () => {
    const index = createIndex({ name: 'uq_email', kind: 'unique_constraint' });
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
    expect(generateAlterDDL(diff)).toBe('ALTER TABLE users RENAME COLUMN "Id" TO id;');
    expect(generateRollbackDDL(diff)).toBe('ALTER TABLE users RENAME COLUMN id TO "Id";');
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
    expect(generateAlterDDL(diff)).toBe(
      'ALTER TABLE "Audit"."Users" ADD COLUMN "TenantId" INTEGER;',
    );
    expect(generateRollbackDDL(diff)).toBe(
      dependencyNotice + 'ALTER TABLE "Audit"."Users" DROP COLUMN "TenantId";',
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
    expect(generateAlterDDL(diff)).toBe(
      dependencyNotice + 'ALTER TABLE users DROP CONSTRAINT users_identity;',
    );
    expect(generateRollbackDDL(diff)).toBe(
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
      'sqlserver',
      'ALTER SCHEMA archive TRANSFER public.orders;',
      'ALTER SCHEMA public TRANSFER archive.archived_orders;',
    ],
  ] as const)(
    'moves schemas before renaming or changing fields (%s)',
    (dbType, forwardMove, reverseMove) => {
      const before = withDefaultEditorSession({
        dbType,
        schemaName: 'public',
        tableName: 'orders',
        tableComment: '',
        rows: [],
        indexes: [],
        authInput: '',
        authObjects: [],
      });
      const after = {
        ...before,
        schemaName: 'archive',
        tableName: 'archived_orders',
        rows: [
          {
            id: 'field-1',
            fieldName: 'id',
            fieldType: 'int',
            fieldComment: '',
            nullable: false,
          },
        ],
      };
      const diff = diffPersistedState(before, after);
      const sql = generateAlterDDL(diff);
      const rollback = generateRollbackDDL(diff);
      expect(sql.startsWith(forwardMove)).toBe(true);
      expect(sql).toContain('ALTER TABLE archive.archived_orders ADD');
      expect(rollback.startsWith(dependencyNotice + reverseMove)).toBe(true);
      expect(rollback).toContain('ALTER TABLE public.orders DROP COLUMN id;');
    },
  );

  it.each(['oracle'] as const)(
    'stops automatic changes for unsupported schema moves (%s)',
    (dbType) => {
      const diff = createTableDiff(
        {
          schemaNameChanged: true,
          oldSchemaName: 'public',
          newSchemaName: dbType === 'oracle' ? 'archive' : '',
          fields: [{ type: 'remove', fieldName: 'id', oldField: createField({ name: 'id' }) }],
        },
        dbType,
      );
      const sql = generateAlterDDL(diff);
      expect(sql).toContain('Manual migration required: schema change');
      expect(sql).not.toContain('DROP COLUMN');
    },
  );

  it.each([true])('keeps the schema through forward and reverse changes (rename=%s)', (rename) => {
    const before = withDefaultEditorSession({
      dbType: 'postgresql' as const,
      schemaName: 'audit',
      tableName: 'orders',
      tableComment: '',
      rows: [],
      indexes: [],
      authInput: '',
      authObjects: [],
    });
    const after = {
      ...before,
      tableName: rename ? 'archived_orders' : 'orders',
      rows: [
        {
          id: 'field-1',
          fieldName: 'id',
          fieldType: 'int',
          fieldComment: '',
          nullable: false,
        },
      ],
    };
    const diff = diffPersistedState(before, after);
    const forward = generateAlterDDL(diff);
    const rollback = generateRollbackDDL(diff);

    expect(forward).toContain(
      `ALTER TABLE audit.${after.tableName} ADD COLUMN id INTEGER NOT NULL;`,
    );
    expect(rollback).toContain('ALTER TABLE audit.orders DROP COLUMN id;');
    expect(forward.includes('ALTER TABLE audit.orders RENAME TO archived_orders;')).toBe(rename);
    expect(rollback.includes('ALTER TABLE audit.archived_orders RENAME TO orders;')).toBe(rename);
  });

  it.each(['mysql'] as const)(
    'retains the destination database when renaming a qualified table (%s)',
    (dbType) => {
      const sql = generateRenameTable('audit.orders', 'audit.archived_orders', dbType);
      expect(sql).toBe('ALTER TABLE audit.orders RENAME TO audit.archived_orders;');
    },
  );

  it('qualifies standalone index drops using the table schema', () => {
    const diff = createTableDiff(
      { indexes: [{ type: 'remove', index: createIndex() }] },
      'postgresql',
      'orders',
      'audit',
    );
    expect(generateAlterDDL(diff)).toBe('DROP INDEX audit.idx_name;');
  });

  it.each([{ order: [2, 0, 1] }])(
    'orders rename chains and their rollback independently of diff order ($order)',
    ({ order }) => {
      const renames = [createRename('a', 'b'), createRename('b', 'c'), createRename('c', 'd')];
      const diff = createTableDiff({ fields: order.map((index) => renames[index]) }, 'postgresql');
      expect(generateAlterDDL(diff)).toBe(
        [
          'ALTER TABLE users RENAME COLUMN c TO d;',
          'ALTER TABLE users RENAME COLUMN b TO c;',
          'ALTER TABLE users RENAME COLUMN a TO b;',
        ].join('\n\n'),
      );
      expect(generateRollbackDDL(diff)).toBe(
        [
          'ALTER TABLE users RENAME COLUMN b TO a;',
          'ALTER TABLE users RENAME COLUMN c TO b;',
          'ALTER TABLE users RENAME COLUMN d TO c;',
        ].join('\n\n'),
      );
    },
  );

  it.each(['oracle'] as const)(
    '%s orders equivalent quoted and unquoted rename targets',
    (dbType) => {
      const diff = createTableDiff(
        { fields: [createRename('A', 'b'), createRename('"B"', 'C')] },
        dbType,
      );

      expect(generateAlterDDL(diff)).toBe(
        [
          'ALTER TABLE users RENAME COLUMN "B" TO C;',
          'ALTER TABLE users RENAME COLUMN A TO b;',
        ].join('\n\n'),
      );
      expect(generateRollbackDDL(diff)).toBe(
        [
          'ALTER TABLE users RENAME COLUMN b TO A;',
          'ALTER TABLE users RENAME COLUMN C TO "B";',
        ].join('\n\n'),
      );
    },
  );

  it('changes column properties only after freeing the rename target', () => {
    const diff = createTableDiff(
      {
        fields: [
          {
            ...createRename('a', 'b'),
            changes: ['nullable'] as const,
            oldField: createField({ name: 'a', nullable: true }),
          },
          createRename('b', 'c'),
        ],
      },
      'postgresql',
    );
    expect(generateAlterDDL(diff)).toBe(
      [
        'ALTER TABLE users RENAME COLUMN b TO c;',
        'ALTER TABLE users RENAME COLUMN a TO b;',
        'ALTER TABLE users ALTER COLUMN b SET NOT NULL;',
      ].join('\n\n'),
    );
  });

  it.each([{ cycle: [createRename('a', 'b'), createRename('b', 'a')] }])(
    'does not emit partial migrations when column renames form a cycle ($cycle.length)',
    ({ cycle }) => {
      const diff = createTableDiff(
        {
          tableNameChanged: true,
          oldTableName: 'users',
          newTableName: 'renamed_users',
          fields: [
            ...cycle,
            createRename('x', 'y'),
            {
              type: 'remove',
              fieldName: 'obsolete',
              oldField: createField({ name: 'obsolete' }),
            },
          ],
          indexes: [{ type: 'remove', index: createIndex() }],
        },
        'postgresql',
      );
      expect(generateAlterDDL(diff)).toBe(
        '-- Manual migration required: cyclic column renames in users (postgresql). No automatic changes generated.',
      );
      expect(generateRollbackDDL(diff)).toBe(
        '-- Manual migration required: cyclic column renames in renamed_users (postgresql). No automatic changes generated.',
      );
    },
  );

  it('drops the same truncated primary key name that CREATE emitted', () => {
    const index = createIndex({
      name: `pk_${'audit_events_'.repeat(4)}`,
      kind: 'primary',
      fields: [{ name: 'id', direction: 'ASC' }],
    });
    const created = buildDDL({
      dbType: 'oracle',
      tableName: 'users',
      tableComment: '',
      fields: [createField()],
      indexes: [index],
    });
    const constraint = created.match(/ADD CONSTRAINT (\S+) PRIMARY KEY/)?.[1];

    expect(constraint).toHaveLength(30);
    expect(
      generateRollbackDDL(createTableDiff({ indexes: [{ type: 'add', index }] }, 'oracle')),
    ).toContain(`DROP CONSTRAINT ${constraint};`);
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

    const sql = generateAlterDDL(diff);

    expect(sql).toBe(
      'ALTER TABLE users RENAME TO accounts;\n\n' +
        'ALTER TABLE accounts ADD COLUMN age INT NOT NULL;',
    );
  });

  it('emits an explicit notice for table options that need manual migration', () => {
    const diff = createTableDiff({ miscConfigChanged: true }, 'hive');

    expect(generateAlterDDL(diff)).toBe(
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
    const sql = generateAlterDDL(diff);
    const lines = sql.split('\n\n');
    expect(lines).toEqual([
      dependencyNotice.trim(),
      'ALTER TABLE users DROP FOREIGN KEY fk_user;',
      'ALTER TABLE users\n  DROP INDEX idx_old,\n  DROP COLUMN old_col,\n  ADD COLUMN new_col VARCHAR(255) NULL,\n  ADD INDEX idx_new (new_col ASC);',
      'ALTER TABLE users ADD CONSTRAINT fk_user FOREIGN KEY (new_col) REFERENCES users (id);',
    ]);
  });
});

describe('generateRollbackDDL', () => {
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

    const sql = generateRollbackDDL(diff);

    expect(sql).toBe(
      dependencyNotice +
        'ALTER TABLE accounts RENAME TO users;\n\n' +
        'ALTER TABLE users DROP COLUMN age;',
    );
  });

  it('rollback: removes and restores foreign keys in dependency order', () => {
    const diff = createTableDiff(
      {
        fields: [
          { type: 'add', fieldName: 'user_id', newField: createField({ name: 'user_id' }) },
          { type: 'remove', fieldName: 'owner_id', oldField: createField({ name: 'owner_id' }) },
        ],
        indexes: [
          {
            type: 'add',
            index: createIndex({
              name: 'idx_user',
              fields: [{ name: 'user_id', direction: 'ASC' }],
            }),
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
      },
      'mysql',
      'orders',
    );

    expect(generateRollbackDDL(diff).split('\n\n')).toEqual([
      dependencyNotice.trim(),
      'ALTER TABLE orders DROP FOREIGN KEY fk_user;',
      'ALTER TABLE orders\n  DROP INDEX idx_user,\n  DROP COLUMN user_id,\n  ADD COLUMN owner_id INT NOT NULL,\n  ADD INDEX idx_owner (owner_id ASC);',
      'ALTER TABLE orders ADD CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users (id);',
    ]);
  });
});

describe('table statements', () => {
  it('uses sp_rename for SQL Server table renames', () => {
    expect(generateRenameTable("old'users", "new'users", 'sqlserver')).toBe(
      "EXEC sp_rename 'old''users', 'new''users';",
    );
  });
});

describe('generateTableCommentAlter', () => {
  it('updates an existing SQL Server table comment', () => {
    expect(generateTableCommentAlter('users', '表', 'sqlserver', '旧注释')).toContain(
      'sp_updateextendedproperty',
    );
  });
});

describe('generateRenameColumn', () => {
  it('generates SQL Server sp_rename', () => {
    const diff: FieldDiff = {
      type: 'rename',
      fieldName: 'new_age',
      oldFieldName: 'age',
      newFieldName: 'new_age',
      oldField: createField({ name: 'age' }),
      newField: createField({ name: 'new_age' }),
    };
    expect(generateRenameColumn('users', diff, 'sqlserver')).toBe(
      "EXEC sp_rename 'users.age', 'new_age', 'COLUMN';",
    );
  });
});

describe('generateAddColumn', () => {
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
});

describe('generateModifyColumn', () => {
  it.each(['postgresql'] as const)('enables and seeds an identity atomically for %s', (dbType) => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'id',
      oldField: createField({ nullable: true, defaultKind: 'constant', defaultValue: '9' }),
      newField: createField({ defaultKind: 'auto_increment' }),
      changes: ['default', 'nullable'],
    };
    expect(generateModifyColumn('users', diff, dbType)).toBe(
      "DO 'BEGIN\n" +
        'ALTER TABLE users ALTER COLUMN id DROP DEFAULT;\n' +
        'ALTER TABLE users ALTER COLUMN id SET NOT NULL;\n' +
        'ALTER TABLE users ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;\n' +
        "PERFORM setval(pg_get_serial_sequence(''users'', ''id''), GREATEST(COALESCE(MAX(id), 1), 1), COALESCE(MAX(id), 0) >= 1) FROM users;\n" +
        "END';",
    );
    expect(generateRollbackDDL(createTableDiff({ fields: [diff] }, dbType))).toBe(
      'ALTER TABLE users ALTER COLUMN id DROP IDENTITY;\n' +
        'ALTER TABLE users ALTER COLUMN id DROP NOT NULL;\n' +
        'ALTER TABLE users ALTER COLUMN id SET DEFAULT 9;',
    );
  });

  it('drops identity before changing its type, nullability and default', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: 'id',
      oldField: createField({ defaultKind: 'auto_increment' }),
      newField: createField({
        type: 'bigint',
        nullable: true,
        defaultKind: 'constant',
        defaultValue: '7',
      }),
      changes: ['type', 'nullable', 'default'],
    };
    expect(generateModifyColumn('users', diff, 'postgresql')).toBe(
      'ALTER TABLE users ALTER COLUMN id DROP IDENTITY;\n' +
        'ALTER TABLE users ALTER COLUMN id TYPE BIGINT;\n' +
        'ALTER TABLE users ALTER COLUMN id DROP NOT NULL;\n' +
        'ALTER TABLE users ALTER COLUMN id SET DEFAULT 7;',
    );
  });

  it('quotes identifiers and string arguments inside the identity block separately', () => {
    const diff: FieldDiff = {
      type: 'modify',
      fieldName: "Id's",
      oldField: createField({ name: "Id's" }),
      newField: createField({ name: "Id's", defaultKind: 'auto_increment' }),
      changes: ['default'],
    };
    const sql = generateModifyColumn("Audit.Users'Log", diff, 'postgresql');
    expect(sql).toContain('ALTER TABLE "Audit"."Users\'\'Log" ALTER COLUMN "Id\'\'s"');
    expect(sql).toContain("pg_get_serial_sequence(''\"Audit\".\"Users''''Log\"'', ''Id''''s'')");
  });
});

describe('buildDialectDefaultClause', () => {
  it.each(['now()', "O'Reilly"])('keeps the text constant %j literal', (value) => {
    expect(
      buildDialectDefaultClause(
        createField({ type: 'text', defaultKind: 'constant', defaultValue: value }),
        'postgresql',
      ),
    ).toBe(`DEFAULT '${value.replace(/'/g, "''")}'`);
  });

  it('emits SQL only for explicit expression defaults', () => {
    expect(
      buildDialectDefaultClause(
        createField({ type: 'text', defaultKind: 'expression', defaultValue: "lower('HELLO')" }),
        'postgresql',
      ),
    ).toBe("DEFAULT lower('HELLO')");
  });

  it('returns empty for unsupported default on type', () => {
    expect(
      buildDialectDefaultClause(createField({ defaultKind: 'uuid', type: 'int' }), 'mysql'),
    ).toBe('');
    expect(
      buildDialectDefaultClause(createField({ defaultKind: 'uuid', type: 'json' }), 'mysql'),
    ).toBe('');
    expect(
      buildDialectDefaultClause(
        createField({ defaultKind: 'current_timestamp', type: 'int' }),
        'mysql',
      ),
    ).toBe('');
  });
});

describe('generateAddForeignKey', () => {
  it('adds foreign key with schema-qualified ref table', () => {
    const diff: ForeignKeyDiff = {
      type: 'add',
      foreignKey: createFk({ refSchema: 'public', refTable: 'users' }),
    };
    expect(generateAddForeignKey('orders', diff, 'postgresql')).toBe(
      'ALTER TABLE orders ADD CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES public.users (id);',
    );
  });
});
