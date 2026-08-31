import { describe, it, expect } from 'vitest';
import { generateAlterDDL } from '@ddlbuilder/ddl-core';
import type { TableDiff } from '@ddlbuilder/ddl-core';
import type { NormalizedField } from '@ddlbuilder/shared-types';

function createField(overrides: Partial<NormalizedField> = {}): NormalizedField {
  return {
    name: 'test_field',
    type: 'VARCHAR(100)',
    comment: '',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
    ...overrides,
  };
}

function createEmptyDiff(): TableDiff {
  return {
    hasChanges: false,
    tableNameChanged: false,
    tableCommentChanged: false,
    miscConfigChanged: false,
    fields: [],
    indexes: [],
  };
}

describe('generateAlterDDL', () => {
  describe('无变更', () => {
    it('无变更时返回空字符串', () => {
      const diff = createEmptyDiff();
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toBe('');
    });
  });

  describe('表注释变更', () => {
    it('MySQL 生成表注释变更', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        tableCommentChanged: true,
        newTableComment: '用户表',
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain("ALTER TABLE users COMMENT = '用户表'");
    });

    it('PostgreSQL 生成表注释变更', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        tableCommentChanged: true,
        newTableComment: '用户表',
      };
      const result = generateAlterDDL('users', diff, [], 'postgresql');
      expect(result).toContain("COMMENT ON TABLE users IS '用户表'");
    });
  });

  describe('字段新增', () => {
    it('MySQL 生成 ADD COLUMN', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        fields: [
          {
            type: 'add',
            fieldName: 'email',
            newField: createField({
              name: 'email',
              type: 'VARCHAR(255)',
              nullable: false,
            }),
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users ADD COLUMN email');
      expect(result).toContain('NOT NULL');
    });

    it('Oracle 生成 ADD (column)', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        fields: [
          {
            type: 'add',
            fieldName: 'email',
            newField: createField({ name: 'email', type: 'VARCHAR(255)' }),
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'oracle');
      expect(result).toContain('ALTER TABLE users ADD (email');
    });
  });

  describe('字段删除', () => {
    it('生成 DROP COLUMN', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        fields: [
          {
            type: 'remove',
            fieldName: 'old_field',
            oldField: createField({ name: 'old_field' }),
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users DROP COLUMN old_field');
    });
  });

  describe('字段修改', () => {
    it('MySQL 生成 MODIFY COLUMN', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        fields: [
          {
            type: 'modify',
            fieldName: 'name',
            oldField: createField({ name: 'name', type: 'VARCHAR(50)' }),
            newField: createField({ name: 'name', type: 'VARCHAR(100)' }),
            changes: ['type'],
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users MODIFY COLUMN name');
    });

    it('PostgreSQL 生成多条 ALTER 语句', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        fields: [
          {
            type: 'modify',
            fieldName: 'name',
            oldField: createField({
              name: 'name',
              type: 'VARCHAR(50)',
              nullable: true,
            }),
            newField: createField({
              name: 'name',
              type: 'VARCHAR(100)',
              nullable: false,
            }),
            changes: ['type', 'nullable'],
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'postgresql');
      expect(result).toContain('ALTER TABLE users ALTER COLUMN name TYPE');
      expect(result).toContain('ALTER TABLE users ALTER COLUMN name SET NOT NULL');
    });

    it('SQL Server 生成 ALTER COLUMN', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        fields: [
          {
            type: 'modify',
            fieldName: 'name',
            newField: createField({ name: 'name', type: 'VARCHAR(100)' }),
            changes: ['type'],
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'sqlserver');
      expect(result).toContain('ALTER TABLE users ALTER COLUMN name');
    });
  });

  describe('索引变更', () => {
    it('生成新增索引', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        indexes: [
          {
            type: 'add',
            index: {
              id: '1',
              name: 'idx_email',
              fields: [{ name: 'email', direction: 'ASC' }],
              kind: 'index',
            },
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users ADD INDEX idx_email');
    });

    it('生成新增唯一索引', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        indexes: [
          {
            type: 'add',
            index: {
              id: '1',
              name: 'uk_email',
              fields: [{ name: 'email', direction: 'ASC' }],
              kind: 'unique_index',
            },
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users ADD UNIQUE INDEX uk_email');
    });

    it('MySQL 生成删除索引', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        indexes: [
          {
            type: 'remove',
            index: {
              id: '1',
              name: 'idx_old',
              fields: [{ name: 'old_field', direction: 'ASC' }],
              kind: 'index',
            },
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users DROP INDEX idx_old');
    });

    it('PostgreSQL 生成删除索引', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        indexes: [
          {
            type: 'remove',
            index: {
              id: '1',
              name: 'idx_old',
              fields: [{ name: 'old_field', direction: 'ASC' }],
              kind: 'index',
            },
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'postgresql');
      expect(result).toContain('DROP INDEX idx_old');
      expect(result).not.toContain(' ON '); // PostgreSQL 不需要 ON table
    });
  });

  describe('主键变更', () => {
    it('MySQL 删除主键', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        indexes: [
          {
            type: 'remove',
            index: {
              id: '1',
              name: 'pk_users',
              fields: [{ name: 'id', direction: 'ASC' }],
              kind: 'primary',
            },
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users DROP PRIMARY KEY');
    });

    it('MySQL 添加主键', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        indexes: [
          {
            type: 'add',
            index: {
              id: '1',
              name: 'pk_users',
              fields: [{ name: 'id', direction: 'ASC' }],
              kind: 'primary',
            },
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toContain('ALTER TABLE users ADD PRIMARY KEY');
    });
  });

  describe('混合变更', () => {
    it('在同一条 ALTER 中删除索引、修改字段和新增索引', () => {
      const diff: TableDiff = {
        ...createEmptyDiff(),
        hasChanges: true,
        fields: [
          {
            type: 'add',
            fieldName: 'new_field',
            newField: createField({ name: 'new_field' }),
          },
        ],
        indexes: [
          {
            type: 'remove',
            index: {
              id: '1',
              name: 'idx_old',
              fields: [{ name: 'old', direction: 'ASC' }],
              kind: 'index',
            },
          },
          {
            type: 'add',
            index: {
              id: '2',
              name: 'idx_new',
              fields: [{ name: 'new_field', direction: 'ASC' }],
              kind: 'index',
            },
          },
        ],
      };
      const result = generateAlterDDL('users', diff, [], 'mysql');
      expect(result).toBe(
        '-- Manual migration required for foreign keys from other tables that reference changed columns or keys. Their definitions are not available in this single-table diff; coordinate those changes before running this SQL.\n\n' +
          'ALTER TABLE users\n  DROP INDEX idx_old,\n  ADD COLUMN new_field VARCHAR(100) NULL,\n  ADD INDEX idx_new (new_field ASC);',
      );
    });
  });
});
