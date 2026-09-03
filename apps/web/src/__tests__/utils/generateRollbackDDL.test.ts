import { describe, expect, it } from 'vitest';
import { generateRollbackDDL } from '@ddlbuilder/ddl-core';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import type { TableDiff } from '@ddlbuilder/ddl-core';

function createField(overrides: Partial<NormalizedField> = {}): NormalizedField {
  return {
    name: 'col',
    type: 'varchar(100)',
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
    oldDbType: 'mysql',
    newDbType: 'mysql',
    tableNameChanged: false,
    oldTableName: 'users',
    newTableName: 'users',
    oldSchemaName: '',
    newSchemaName: '',
    tableCommentChanged: false,
    miscConfigChanged: false,
    fields: [],
    indexes: [],
    foreignKeys: [],
  };
}

describe('generateRollbackDDL', () => {
  it('无变更时返回空字符串', () => {
    const result = generateRollbackDDL(createEmptyDiff());
    expect(result).toBe('');
  });

  it('应该合并反向字段和索引变更，避免无效中间状态', () => {
    const diff: TableDiff = {
      ...createEmptyDiff(),
      tableCommentChanged: true,
      oldTableComment: '旧注释',
      fields: [
        {
          type: 'modify',
          fieldName: 'nick',
          oldField: createField({ name: 'nick', type: 'varchar(50)' }),
          newField: createField({ name: 'nick', type: 'varchar(120)' }),
          changes: ['type'],
        },
        {
          type: 'add',
          fieldName: 'new_col',
          newField: createField({ name: 'new_col', nullable: false }),
        },
        {
          type: 'rename',
          fieldName: 'old_name',
          oldFieldName: 'old_name',
          newFieldName: 'new_name',
          oldField: createField({ name: 'old_name' }),
          newField: createField({ name: 'new_name' }),
        },
        {
          type: 'remove',
          fieldName: 'removed_col',
          oldField: createField({
            name: 'removed_col',
            type: 'varchar(20)',
            nullable: false,
          }),
        },
      ],
      indexes: [
        {
          type: 'add',
          index: {
            id: '1',
            name: 'idx_new',
            fields: [{ name: 'new_col', direction: 'ASC' }],
            kind: 'index',
          },
        },
        {
          type: 'remove',
          index: {
            id: '2',
            name: 'idx_old',
            fields: [{ name: 'old_name', direction: 'ASC' }],
            kind: 'index',
          },
        },
      ],
    };

    const sql = generateRollbackDDL(diff);
    expect(sql).toBe(
      '-- Manual migration required for foreign keys from other tables that reference changed columns or keys. Their definitions are not available in this single-table diff; coordinate those changes before running this SQL.\n\n' +
        "ALTER TABLE users COMMENT = '旧注释';\n\n" +
        'ALTER TABLE users\n' +
        '  DROP INDEX idx_new,\n' +
        '  MODIFY COLUMN nick VARCHAR(50) NULL,\n' +
        '  DROP COLUMN new_col,\n' +
        '  RENAME COLUMN new_name TO old_name,\n' +
        '  ADD COLUMN removed_col VARCHAR(20) NOT NULL,\n' +
        '  ADD INDEX idx_old (old_name ASC);',
    );
  });
});
