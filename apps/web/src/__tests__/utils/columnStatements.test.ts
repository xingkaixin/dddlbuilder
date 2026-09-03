import { describe, expect, it } from 'vitest';
import type {
  AddFieldDiff,
  ModifyFieldDiff,
  RemoveFieldDiff,
  RenameFieldDiff,
} from '@ddlbuilder/ddl-core';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import {
  generateAddColumn,
  generateDropColumn,
  generateModifyColumn,
  generateRenameColumn,
  generateTableCommentAlter,
} from '@ddlbuilder/ddl-core';

function createField(overrides: Partial<NormalizedField> = {}): NormalizedField {
  return {
    name: 'col',
    type: 'varchar(64)',
    comment: '',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
    ...overrides,
  };
}

function createAddDiff(newField: NormalizedField): AddFieldDiff {
  return {
    type: 'add',
    fieldName: newField.name,
    newField,
  };
}

function createRemoveDiff(fieldName: string): RemoveFieldDiff {
  return {
    type: 'remove',
    fieldName,
    oldField: createField({ name: fieldName }),
  };
}

function createModifyDiff(
  newField: NormalizedField,
  changes: ModifyFieldDiff['changes'],
): ModifyFieldDiff {
  return {
    type: 'modify',
    fieldName: newField.name,
    oldField: createField({ name: newField.name }),
    newField,
    changes,
  };
}

function createRenameDiff(oldFieldName: string, newFieldName: string): RenameFieldDiff {
  return {
    type: 'rename',
    fieldName: newFieldName,
    oldField: createField({ name: oldFieldName }),
    newField: createField({ name: newFieldName }),
    oldFieldName,
    newFieldName,
  };
}

describe('columnStatements', () => {
  it('应生成多数据库表注释 SQL 并处理转义', () => {
    expect(generateTableCommentAlter('users', "O'Hara", 'mysql')).toBe(
      "ALTER TABLE users COMMENT = 'O''Hara';",
    );
    expect(generateTableCommentAlter('users', '表', 'postgresql')).toBe(
      "COMMENT ON TABLE users IS '表';",
    );
    expect(generateTableCommentAlter('users', '表', 'sqlserver', '旧注释')).toContain(
      'sp_updateextendedproperty',
    );
    expect(generateTableCommentAlter('users', '表', 'polardb')).toBe(
      "ALTER TABLE users COMMENT = '表';",
    );
  });

  it('应生成重命名字段 SQL', () => {
    expect(generateRenameColumn('users', createRenameDiff('old_name', 'new_name'), 'mysql')).toBe(
      'ALTER TABLE users RENAME COLUMN old_name TO new_name;',
    );

    expect(
      generateRenameColumn('users', createRenameDiff('old_name', 'new_name'), 'sqlserver'),
    ).toBe("EXEC sp_rename 'users.old_name', 'new_name', 'COLUMN';");

    expect(generateRenameColumn('users', createRenameDiff('old_name', 'new_name'), 'polardb')).toBe(
      'ALTER TABLE users RENAME COLUMN old_name TO new_name;',
    );
  });

  it('应生成新增字段 SQL', () => {
    const newField = createField({
      name: 'created_at',
      type: 'timestamp',
      nullable: false,
      defaultKind: 'current_timestamp',
    });

    const sqlServerSql = generateAddColumn('users', createAddDiff(newField), 'sqlserver');
    const oracleSql = generateAddColumn('users', createAddDiff(newField), 'oracle');

    expect(sqlServerSql).toContain('ALTER TABLE users ADD created_at');
    expect(oracleSql).toContain('ALTER TABLE users ADD (created_at');

    const mysqlAutoIncSql = generateAddColumn(
      'users',
      createAddDiff(
        createField({
          name: 'id2',
          type: 'int',
          nullable: false,
          defaultKind: 'auto_increment',
        }),
      ),
      'mysql',
    );
    expect(mysqlAutoIncSql).toContain('AUTO_INCREMENT');

    const fallbackSql = generateAddColumn('users', createAddDiff(newField), 'polardb');
    expect(fallbackSql).toContain('ALTER TABLE users ADD COLUMN created_at');
  });

  it('应生成字段修改 SQL（MySQL 与 PostgreSQL 分支）', () => {
    const mysqlSql = generateModifyColumn(
      'users',
      createModifyDiff(
        createField({
          name: 'updated_at',
          type: 'timestamp',
          nullable: false,
          defaultKind: 'current_timestamp',
          onUpdate: 'current_timestamp',
          comment: "更新时间'O",
        }),
        ['type', 'nullable', 'default', 'comment'],
      ),
      'mysql',
    );

    expect(mysqlSql).toContain('ALTER TABLE users MODIFY COLUMN updated_at');
    expect(mysqlSql).toContain('ON UPDATE CURRENT_TIMESTAMP');
    expect(mysqlSql).toContain("COMMENT '更新时间''O'");

    const postgresSetSql = generateModifyColumn(
      'users',
      createModifyDiff(
        createField({
          name: 'name',
          type: 'varchar(128)',
          nullable: true,
          defaultKind: 'constant',
          defaultValue: 'abc',
          comment: "备注'O",
        }),
        ['type', 'nullable', 'default', 'comment'],
      ),
      'postgresql',
    );

    expect(postgresSetSql).toContain('ALTER TABLE users ALTER COLUMN name TYPE VARCHAR(128);');
    expect(postgresSetSql).toContain('ALTER TABLE users ALTER COLUMN name DROP NOT NULL;');
    expect(postgresSetSql).toContain("ALTER TABLE users ALTER COLUMN name SET DEFAULT 'abc';");
    expect(postgresSetSql).toContain("COMMENT ON COLUMN users.name IS '备注''O';");

    const postgresDropDefaultSql = generateModifyColumn(
      'users',
      createModifyDiff(createField({ name: 'age', type: 'int', defaultKind: 'none' }), ['default']),
      'postgresql',
    );
    expect(postgresDropDefaultSql).toContain('ALTER TABLE users ALTER COLUMN age DROP DEFAULT;');

    const postgresSetNotNullSql = generateModifyColumn(
      'users',
      createModifyDiff(
        createField({
          name: 'code',
          type: 'varchar(32)',
          nullable: false,
        }),
        ['nullable'],
      ),
      'postgresql',
    );
    expect(postgresSetNotNullSql).toContain('ALTER TABLE users ALTER COLUMN code SET NOT NULL;');

    const fallbackModifySql = generateModifyColumn(
      'users',
      createModifyDiff(createField({ name: 'col', type: 'varchar(32)' }), ['type']),
      'polardb',
    );
    expect(fallbackModifySql).toContain('ALTER TABLE users MODIFY COLUMN col');
  });

  it('应生成删除字段 SQL', () => {
    expect(generateDropColumn('users', createRemoveDiff('legacy'), 'dm')).toBe(
      'ALTER TABLE users DROP COLUMN legacy;',
    );

    expect(generateDropColumn('users', createRemoveDiff('legacy'), 'postgresql-citus')).toBe(
      'ALTER TABLE users DROP COLUMN legacy;',
    );

    expect(generateDropColumn('users', createRemoveDiff('legacy'), 'polardb')).toBe(
      'ALTER TABLE users DROP COLUMN legacy;',
    );
  });
});
