import { describe, expect, it } from 'vitest';
import {
  withDefaultEditorSession,
  type DatabaseType,
  type IndexDefinition,
} from '@ddlbuilder/shared-types';
import { diffPersistedState } from '../utils/tableDiff';
import { generateAlterDDL, generateRollbackDDL } from '../utils/alter-ddl';

const state = (dbType: DatabaseType = 'postgresql') =>
  withDefaultEditorSession({
    dbType,
    schemaName: '',
    tableName: 'items',
    tableComment: '',
    rows: ['id', 'parent_id', 'other_id'].map((name) => ({
      id: name,
      fieldName: name,
      fieldType: 'int',
      fieldComment: '',
      nullable: name !== 'id',
    })),
    indexes: [
      {
        id: 'primary',
        name: 'items_pkey',
        kind: 'primary',
        fields: [{ name: 'id', direction: 'ASC' }],
      },
    ],
    foreignKeys: [
      {
        id: 'parent',
        name: 'fk_parent',
        fields: ['parent_id'],
        refTable: 'items',
        refFields: ['id'],
        onDelete: 'CASCADE',
      },
    ],
    authInput: '',
    authObjects: [],
  });

describe('ALTER foreign key dependencies', () => {
  it.each(['postgresql', 'postgresql-citus', 'kingbase', 'gaussdb'] as const)(
    '%s preserves a renamed primary constraint and its foreign key dependencies',
    (dbType) => {
      const before = state(dbType);
      const after = {
        ...before,
        indexes: before.indexes.map((index) => ({ ...index, name: 'new_pkey' })),
      };
      const diff = diffPersistedState(before, after);
      expect(diff.foreignKeys).toEqual([]);
      expect(diff.unchangedForeignKeys).toEqual(before.foreignKeys);
      expect(generateAlterDDL(diff)).toBe(
        'ALTER TABLE items RENAME CONSTRAINT items_pkey TO new_pkey;',
      );
      expect(generateRollbackDDL(diff)).toBe(
        'ALTER TABLE items RENAME CONSTRAINT new_pkey TO items_pkey;',
      );
    },
  );

  it.each([
    ['unique_constraint', 'ALTER TABLE audit.items RENAME CONSTRAINT old_key TO new_key;'],
    ['unique_index', 'ALTER INDEX audit.old_key RENAME TO new_key;'],
  ] satisfies [IndexDefinition['kind'], string][])(
    'preserves a referenced %s when only its name changes',
    (kind, expected) => {
      const before = {
        ...state(),
        schemaName: 'audit',
        indexes: [{ ...state().indexes[0], name: 'old_key', kind }],
      };
      const after = {
        ...before,
        indexes: before.indexes.map((index) => ({ ...index, name: 'new_key' })),
      };
      expect(generateAlterDDL(diffPersistedState(before, after))).toBe(expected);
    },
  );

  it('preserves a primary key when its column is renamed', () => {
    const before = { ...state(), foreignKeys: [] };
    const after = {
      ...before,
      rows: before.rows.map((row) => (row.id === 'id' ? { ...row, fieldName: 'item_id' } : row)),
      indexes: [{ ...before.indexes[0], fields: [{ name: 'item_id', direction: 'ASC' as const }] }],
    };
    const diff = diffPersistedState(before, after);
    expect(generateAlterDDL(diff)).toBe('ALTER TABLE items RENAME COLUMN id TO item_id;');
    expect(generateRollbackDDL(diff)).toBe('ALTER TABLE items RENAME COLUMN item_id TO id;');
  });

  it('rebuilds an unchanged MySQL self reference around both column type changes', () => {
    const before = state('mysql');
    const after = {
      ...before,
      rows: before.rows.map((row) => ({ ...row, fieldType: 'bigint' })),
    };
    const diff = diffPersistedState(before, after);
    expect(diff.foreignKeys).toEqual([]);
    for (const [sql, type] of [
      [generateAlterDDL(diff), 'BIGINT'],
      [generateRollbackDDL(diff), 'INT'],
    ]) {
      expect(sql).toContain('foreign keys from other tables');
      expect(sql.match(/DROP FOREIGN KEY fk_parent/g)).toHaveLength(1);
      expect(sql).toContain(
        `DROP FOREIGN KEY fk_parent;\n\nALTER TABLE items\n  MODIFY COLUMN id ${type} NOT NULL,\n  MODIFY COLUMN parent_id ${type} NULL,\n  MODIFY COLUMN other_id ${type} NULL;\n\nALTER TABLE items ADD CONSTRAINT fk_parent FOREIGN KEY (parent_id) REFERENCES items (id) ON DELETE CASCADE;`,
      );
    }
  });

  it('leaves unrelated foreign keys untouched', () => {
    const before = state('mysql');
    const after = {
      ...before,
      rows: before.rows.map((row) =>
        row.id === 'other_id' ? { ...row, fieldType: 'bigint' } : row,
      ),
    };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain('MODIFY COLUMN other_id BIGINT NULL;');
    expect(sql).not.toContain('fk_parent');
  });

  it('does not duplicate foreign keys whose definitions already changed', () => {
    const before = state('mysql');
    const after = {
      ...before,
      rows: before.rows.map((row) => ({ ...row, fieldType: 'bigint' })),
      foreignKeys: before.foreignKeys?.map((foreignKey) => ({
        ...foreignKey,
        onDelete: 'RESTRICT' as const,
      })),
    };
    const diff = diffPersistedState(before, after);
    expect(diff.unchangedForeignKeys).toBeUndefined();
    const sql = generateAlterDDL(diff);
    expect(sql.match(/DROP FOREIGN KEY fk_parent/g)).toHaveLength(1);
    expect(sql.match(/ADD CONSTRAINT fk_parent/g)).toHaveLength(1);
    expect(sql).toContain('ON DELETE RESTRICT;');
  });

  it('does not drop an unchanged foreign key that could not be restored after column deletion', () => {
    const before = state('mysql');
    const after = { ...before, rows: before.rows.filter((row) => row.id !== 'parent_id') };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain('unchanged foreign key fk_parent still references a removed column');
    expect(sql).toContain('No automatic changes generated');
    expect(sql).not.toContain('ALTER TABLE');
  });

  it('rebuilds a self reference when its supporting key must actually be replaced', () => {
    const before = state();
    const after = {
      ...before,
      indexes: before.indexes.map((index) => ({
        ...index,
        name: 'unique_id',
        kind: 'unique_constraint' as const,
      })),
    };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain(
      'DROP CONSTRAINT fk_parent;\n\nALTER TABLE items DROP CONSTRAINT items_pkey;\n\nALTER TABLE items ADD CONSTRAINT unique_id UNIQUE (id);\n\nALTER TABLE items ADD CONSTRAINT fk_parent',
    );
  });

  it('does not invent constraints for unavailable external references', () => {
    const before = { ...state(), foreignKeys: [] };
    const after = {
      ...before,
      rows: before.rows.map((row) => ({ ...row, fieldType: 'bigint' })),
    };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain('Their definitions are not available in this single-table diff');
    expect(sql).not.toContain('DROP CONSTRAINT');
    expect(sql).not.toContain('CASCADE');
  });

  it('stops before dropping a foreign key when no referenced key would remain', () => {
    const before = state('mysql');
    const after = { ...before, indexes: [] };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain(
      'cannot verify a supported unique referenced key for unchanged foreign key fk_parent',
    );
    expect(sql).toContain('No automatic changes generated');
    expect(sql).not.toContain('ALTER TABLE');
  });

  it('uses an unchanged alternative unique key when replacing the referenced primary key', () => {
    const original = state();
    const primary = original.indexes[0];
    const alternate: IndexDefinition = { ...primary, kind: 'unique_constraint', name: 'unique_id' };
    const before = { ...original, indexes: [primary, alternate] };
    const after = { ...before, indexes: [alternate] };
    const diff = diffPersistedState(before, after);
    expect(diff.unchangedIndexes).toEqual([alternate]);
    const sql = generateAlterDDL(diff);
    expect(sql).toContain('DROP CONSTRAINT fk_parent;');
    expect(sql).toContain('DROP CONSTRAINT items_pkey;');
    expect(sql).toContain('ADD CONSTRAINT fk_parent FOREIGN KEY (parent_id) REFERENCES items (id)');
  });

  it('finds PostgreSQL dependencies whose referenced columns use a different order', () => {
    const before = {
      ...state(),
      indexes: [
        {
          ...state().indexes[0],
          fields: [
            { name: 'id', direction: 'ASC' as const },
            { name: 'other_id', direction: 'ASC' as const },
          ],
        },
      ],
      foreignKeys: [
        {
          id: 'parent',
          name: 'fk_parent',
          fields: ['parent_id', 'other_id'],
          refTable: 'items',
          refFields: ['other_id', 'id'],
        },
      ],
    };
    const after = {
      ...before,
      indexes: before.indexes.map((index) => ({ ...index, kind: 'unique_constraint' as const })),
    };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain(
      'DROP CONSTRAINT fk_parent;\n\nALTER TABLE items DROP CONSTRAINT items_pkey;',
    );
    expect(sql).toContain('REFERENCES items (other_id, id);');
  });

  it('does not treat an unqualified foreign table as a self reference in another schema', () => {
    const before = { ...state(), schemaName: 'audit', indexes: [] };
    const after = { ...before, rows: before.rows.filter((row) => row.id !== 'id') };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain('ALTER TABLE audit.items DROP COLUMN id;');
    expect(sql).not.toContain('DROP CONSTRAINT');
  });

  it('does not mistake a MySQL composite unique key for uniqueness of its prefix', () => {
    const before = state('mysql');
    const after = {
      ...before,
      indexes: [
        {
          ...before.indexes[0],
          kind: 'unique_constraint' as const,
          fields: [
            { name: 'id', direction: 'ASC' as const },
            { name: 'other_id', direction: 'ASC' as const },
          ],
        },
      ],
    };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain('cannot verify a supported unique referenced key');
    expect(sql).not.toContain('ALTER TABLE');
  });
});
