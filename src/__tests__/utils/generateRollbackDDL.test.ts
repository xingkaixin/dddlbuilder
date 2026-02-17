import { describe, expect, it } from 'vitest';
import { generateRollbackDDL } from '@/utils/alterDdlGenerator';
import type { NormalizedField } from '@/types';
import type { TableDiff } from '@/utils/tableDiff';

function createField(
  overrides: Partial<NormalizedField> = {},
): NormalizedField {
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
    hasChanges: false,
    tableNameChanged: false,
    tableCommentChanged: false,
    miscConfigChanged: false,
    fields: [],
    indexes: [],
  };
}

describe('generateRollbackDDL', () => {
  it('无变更时返回空字符串', () => {
    const result = generateRollbackDDL('users', createEmptyDiff(), [], 'mysql');
    expect(result).toBe('');
  });

  it('应该按逆向顺序生成回滚语句', () => {
    const diff: TableDiff = {
      ...createEmptyDiff(),
      hasChanges: true,
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
            unique: false,
          },
        },
        {
          type: 'remove',
          index: {
            id: '2',
            name: 'idx_old',
            fields: [{ name: 'old_name', direction: 'ASC' }],
            unique: false,
          },
        },
      ],
    };

    const sql = generateRollbackDDL('users', diff, [], 'mysql');
    const orderedFragments = [
      'DROP INDEX idx_new ON users;',
      'ALTER TABLE users MODIFY COLUMN nick VARCHAR(50) NULL;',
      'ALTER TABLE users DROP COLUMN new_col;',
      'ALTER TABLE users RENAME COLUMN new_name TO old_name;',
      'ALTER TABLE users ADD COLUMN removed_col VARCHAR(20) NOT NULL;',
      'CREATE INDEX idx_old ON users (old_name ASC);',
      "ALTER TABLE users COMMENT = '旧注释';",
    ];

    let lastIndex = -1;
    for (const fragment of orderedFragments) {
      const currentIndex = sql.indexOf(fragment);
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    }
  });

  it('无效重命名回滚语句应被过滤掉', () => {
    const diff: TableDiff = {
      ...createEmptyDiff(),
      hasChanges: true,
      fields: [
        {
          type: 'rename',
          fieldName: 'legacy_name',
        },
      ],
      indexes: [],
    };

    const result = generateRollbackDDL('users', diff, [], 'mysql');
    expect(result).toBe('');
  });
});
