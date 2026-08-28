import { describe, expect, it } from 'vitest';
import { generateAddIndex, generateDropIndex } from '@ddlbuilder/ddl-core';
import type { IndexDiff } from '@ddlbuilder/ddl-core';

function createIndexDiff(overrides: Partial<IndexDiff> = {}): IndexDiff {
  return {
    type: 'add',
    index: {
      id: '1',
      name: 'idx_users_name',
      fields: [{ name: 'name', direction: 'ASC' }],
      kind: 'index',
    },
    ...overrides,
  };
}

describe('indexStatements', () => {
  it('应生成主键删除语句（含默认分支）', () => {
    const primaryDiff = createIndexDiff({
      type: 'remove',
      index: {
        id: 'pk',
        name: 'pk_users',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'primary',
      },
    });

    expect(generateDropIndex('users', primaryDiff, 'mysql')).toBe(
      'ALTER TABLE users DROP PRIMARY KEY;',
    );
    expect(generateDropIndex('users', primaryDiff, 'postgresql')).toBe(
      'ALTER TABLE users DROP CONSTRAINT pk_users;',
    );
    expect(generateDropIndex('users', primaryDiff, 'gbase')).toBe(
      'ALTER TABLE users DROP PRIMARY KEY;',
    );
  });

  it('应生成普通索引删除语句', () => {
    const diff = createIndexDiff({
      type: 'remove',
      index: {
        id: '2',
        name: 'idx_users_age',
        fields: [{ name: 'age', direction: 'DESC' }],
        kind: 'index',
      },
    });

    expect(generateDropIndex('users', diff, 'mysql')).toBe('DROP INDEX idx_users_age ON users;');
    expect(generateDropIndex('users', diff, 'postgresql')).toBe('DROP INDEX idx_users_age;');
    expect(generateDropIndex('users', diff, 'sqlserver')).toBe(
      'DROP INDEX idx_users_age ON users;',
    );
    expect(generateDropIndex('users', diff, 'oracle')).toBe('DROP INDEX idx_users_age;');
    expect(generateDropIndex('users', diff, 'kingbase')).toBe('DROP INDEX idx_users_age;');
  });

  it('应生成主键新增语句（多数据库分支）', () => {
    const diff = createIndexDiff({
      type: 'add',
      index: {
        id: '3',
        name: 'pk_users',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'primary',
      },
    });

    expect(generateAddIndex('users', diff, 'mysql')).toBe(
      'ALTER TABLE users ADD PRIMARY KEY (id);',
    );
    expect(generateAddIndex('users', diff, 'postgresql-citus')).toBe(
      'ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id);',
    );
    expect(generateAddIndex('users', diff, 'sqlserver')).toBe(
      'ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id);',
    );
    expect(generateAddIndex('users', diff, 'oracle')).toBe(
      'ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id);',
    );
    expect(generateAddIndex('users', diff, 'kingbase')).toBe(
      'ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id);',
    );
  });

  it('应生成唯一与普通索引新增语句', () => {
    const uniqueDiff = createIndexDiff({
      index: {
        id: '4',
        name: 'uk_users_email',
        fields: [{ name: 'email', direction: 'ASC' }],
        kind: 'unique_index',
      },
    });
    const normalDiff = createIndexDiff({
      index: {
        id: '5',
        name: 'idx_users_created_at',
        fields: [{ name: 'created_at', direction: 'DESC' }],
        kind: 'index',
      },
    });

    expect(generateAddIndex('users', uniqueDiff, 'mysql')).toBe(
      'CREATE UNIQUE INDEX uk_users_email ON users (email ASC);',
    );
    expect(generateAddIndex('users', normalDiff, 'mysql')).toBe(
      'CREATE INDEX idx_users_created_at ON users (created_at DESC);',
    );
  });
});
