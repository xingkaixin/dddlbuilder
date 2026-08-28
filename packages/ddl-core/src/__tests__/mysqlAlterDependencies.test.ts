import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession, type IndexDefinition } from '@ddlbuilder/shared-types';
import { diffPersistedState } from '../utils/tableDiff';
import { generateAlterDDL, generateRollbackDDL } from '../utils/alter-ddl';

const primary: IndexDefinition = {
  name: 'PRIMARY',
  fields: [{ name: 'id', direction: 'ASC' }],
  kind: 'primary',
};

const before = withDefaultEditorSession({
  dbType: 'mysql',
  schemaName: '',
  tableName: 'users',
  tableComment: '',
  rows: [
    {
      id: 'id-row',
      fieldName: 'id',
      fieldType: 'int',
      fieldComment: '',
      nullable: false,
      defaultKind: 'auto_increment',
    },
    {
      id: 'name-row',
      fieldName: 'name',
      fieldType: 'varchar(255)',
      fieldComment: '',
      nullable: true,
    },
  ],
  indexes: [primary],
  authInput: '',
  authObjects: [],
});

describe('MySQL ALTER dependencies', () => {
  it('removes and restores identity together with its primary key', () => {
    const after = {
      ...before,
      rows: before.rows.map((row) => ({ ...row, defaultKind: 'none' as const })),
      indexes: [],
    };
    const diff = diffPersistedState(before, after);
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  DROP PRIMARY KEY,\n  MODIFY COLUMN id INT NOT NULL;',
    );
    expect(generateRollbackDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  MODIFY COLUMN id INT AUTO_INCREMENT NOT NULL,\n  ADD PRIMARY KEY (id);',
    );
  });

  it('adds and drops an identity column together with its supporting key', () => {
    const withoutIdentity = { ...before, rows: before.rows.slice(1), indexes: [] };
    const diff = diffPersistedState(withoutIdentity, before);
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  ADD COLUMN id INT AUTO_INCREMENT NOT NULL,\n  ADD PRIMARY KEY (id);',
    );
    expect(generateRollbackDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  DROP PRIMARY KEY,\n  DROP COLUMN id;',
    );
  });

  it('renames an identity column and rebuilds its primary key atomically', () => {
    const after = {
      ...before,
      rows: before.rows.map((row) =>
        row.id === 'id-row' ? { ...row, fieldName: 'user_id' } : row,
      ),
      indexes: [{ ...primary, fields: [{ name: 'user_id', direction: 'ASC' as const }] }],
    };
    const diff = diffPersistedState(before, after);
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  DROP PRIMARY KEY,\n  RENAME COLUMN id TO user_id,\n  ADD PRIMARY KEY (user_id);',
    );
    expect(generateRollbackDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  DROP PRIMARY KEY,\n  RENAME COLUMN user_id TO id,\n  ADD PRIMARY KEY (id);',
    );
  });

  it.each([
    { kind: 'index', clause: 'INDEX idx_id (id ASC)' },
    { kind: 'unique_index', clause: 'UNIQUE INDEX idx_id (id ASC)' },
    { kind: 'unique_constraint', clause: 'CONSTRAINT idx_id UNIQUE (id)' },
  ])('replaces the supporting key without leaving an unindexed identity: $clause', (index) => {
    const after = {
      ...before,
      indexes: [
        {
          ...primary,
          name: 'idx_id',
          kind: index.kind,
        },
      ],
    };
    const diff = diffPersistedState(before, after);
    expect(diff.fields).toEqual([]);
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe(
      `ALTER TABLE users\n  DROP PRIMARY KEY,\n  ADD ${index.clause};`,
    );
    expect(generateRollbackDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  DROP INDEX idx_id,\n  ADD PRIMARY KEY (id);',
    );
  });

  it('renames and disables identity in the same column clause', () => {
    const after = {
      ...before,
      rows: before.rows.map((row) =>
        row.id === 'id-row' ? { ...row, fieldName: 'user_id', defaultKind: 'none' as const } : row,
      ),
      indexes: [],
    };
    const diff = diffPersistedState(before, after);
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  DROP PRIMARY KEY,\n  CHANGE COLUMN id user_id INT NOT NULL;',
    );
    expect(generateRollbackDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  CHANGE COLUMN user_id id INT AUTO_INCREMENT NOT NULL,\n  ADD PRIMARY KEY (id);',
    );
  });

  it('preserves rename-chain data without applying a modification to the wrong column', () => {
    const original = {
      ...before,
      rows: ['a', 'b'].map((name) => ({
        ...before.rows[0],
        id: name,
        fieldName: name,
        defaultKind: 'none' as const,
      })),
      indexes: [],
    };
    const after = {
      ...original,
      rows: [
        { ...original.rows[0], fieldName: 'b', fieldType: 'bigint' },
        { ...original.rows[1], fieldName: 'c' },
      ],
    };
    const diff = diffPersistedState(original, after);
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  CHANGE COLUMN a b BIGINT NOT NULL,\n  RENAME COLUMN b TO c;',
    );
    expect(generateRollbackDDL('users', diff, [], 'mysql')).toBe(
      'ALTER TABLE users\n  CHANGE COLUMN b a INT NOT NULL,\n  RENAME COLUMN c TO b;',
    );
  });

  it('keeps quoted identifiers and punctuation in comments intact', () => {
    const after = {
      ...before,
      rows: before.rows.map((row) =>
        row.id === 'id-row' ? { ...row, fieldName: 'select', fieldComment: "it's; a,b" } : row,
      ),
      indexes: [{ ...primary, fields: [{ name: 'select', direction: 'ASC' as const }] }],
    };
    const diff = diffPersistedState(before, after);
    expect(generateAlterDDL('users', diff, [], 'mysql')).toBe(
      "ALTER TABLE users\n  DROP PRIMARY KEY,\n  CHANGE COLUMN id `select` INT AUTO_INCREMENT NOT NULL COMMENT 'it''s; a,b',\n  ADD PRIMARY KEY (`select`);",
    );
  });
});
