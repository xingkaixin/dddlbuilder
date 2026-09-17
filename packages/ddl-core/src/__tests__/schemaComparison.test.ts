import { describe, expect, it } from 'vitest';
import type { PersistedState, FieldRow } from '@ddlbuilder/shared-types';
import { compareSchemaSnapshots } from '../utils/schemaComparison';
import { snapshotTableKey } from '../utils/schemaSnapshot';
import { SqlParser } from '../parser/SqlParser';

function field(fieldName: string, fieldType = 'int'): FieldRow {
  return { id: fieldName, fieldName, fieldType, fieldComment: '', nullable: false };
}

function table(tableName: string, rows = [field('id')]): PersistedState {
  return {
    tableName,
    schemaName: '',
    tableComment: '',
    dbType: 'mysql',
    sqlFormatMode: 'compact',
    addCount: 1,
    authInput: '',
    authObjects: [],
    rows,
    indexes: [
      {
        id: 'pk',
        name: `pk_${tableName}`,
        kind: 'primary',
        fields: [{ name: 'id', direction: 'ASC' }],
      },
    ],
  };
}

describe('schema snapshot comparison', () => {
  it('ignores editor identities and order while allowing explicit renames', () => {
    const before = table('users', [field('id'), field('name', 'varchar(20)')]);

    const same = {
      ...before,
      rows: [...before.rows].reverse().map((row) => ({ ...row, id: `other-${row.id}` })),
    };
    expect(compareSchemaSnapshots([before], [same]).tables[0].status).toBe('unchanged');
    const after = table('users', [field('id'), field('display_name', 'varchar(20)')]);

    const result = compareSchemaSnapshots(
      [before],
      [after],
      [{ tableKey: snapshotTableKey(before), from: 'name', to: 'display_name' }],
    );
    expect(result.tables[0].diff?.fields[0].type).toBe('rename');
    expect(result.sql).toContain('RENAME COLUMN');
    expect(result.sql).not.toContain('DROP COLUMN');
  });

  it('removes incoming foreign keys before changing parent columns and restores them last', () => {
    const users = table('users');

    const orders = {
      ...table('orders', [field('id'), field('user_id')]),
      foreignKeys: [
        { id: 'fk', name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
      ],
    };
    const result = compareSchemaSnapshots(
      [users, orders],
      [
        { ...users, rows: [field('id', 'bigint')] },
        { ...orders, rows: [field('id'), field('user_id', 'bigint')] },
      ],
    );
    expect(result.blockers).toEqual([]);
    expect(result.sql.indexOf('DROP FOREIGN KEY')).toBeLessThan(
      result.sql.indexOf('MODIFY COLUMN'),
    );
    expect(result.sql.indexOf('ADD CONSTRAINT')).toBeGreaterThan(
      result.sql.lastIndexOf('MODIFY COLUMN'),
    );
  });

  it('builds cyclic new tables before adding their foreign keys and blocks incomplete plans', () => {
    const a = {
      ...table('a'),
      foreignKeys: [{ id: 'a_b', name: 'a_b', fields: ['id'], refTable: 'b', refFields: ['id'] }],
    };
    const b = {
      ...table('b'),
      foreignKeys: [{ id: 'b_a', name: 'b_a', fields: ['id'], refTable: 'a', refFields: ['id'] }],
    };
    const result = compareSchemaSnapshots([], [a, b]);
    expect(result.sql.lastIndexOf('CREATE TABLE')).toBeLessThan(
      result.sql.indexOf('ADD CONSTRAINT'),
    );
    const blocked = compareSchemaSnapshots([a, b], [a]);
    expect(blocked.blockers.join()).toContain('removed');
    expect(blocked.sql).toBe('');

    const changedOptions = compareSchemaSnapshots(
      [a],
      [{ ...a, tableMiscConfig: { enabled: true, engine: 'MyISAM' } }],
    );
    expect(changedOptions.blockers.length).toBeGreaterThan(0);
    expect(changedOptions.sql).toBe('');
  });
});

describe('strict SQL snapshots', () => {
  it('rejects ignored SQL operations and unresolved indexes', async () => {
    const parser = new SqlParser();

    const result = await parser.parseMultiAsync(
      'CREATE TABLE users(id INT PRIMARY KEY); ALTER TABLE users DROP COLUMN id; SELECT 1;',
      'mysql',
      true,
    );
    expect(result.failed).toHaveLength(2);

    const missing = await parser.parseMultiAsync(
      'CREATE TABLE users(id INT); CREATE INDEX idx_name ON missing(name);',
      'mysql',
      true,
    );
    expect(missing.failed).toHaveLength(1);
  });

  it('uses the actual default PostgreSQL primary-key name', async () => {
    const result = await new SqlParser().parseMultiAsync(
      'CREATE TABLE users(id INT PRIMARY KEY);',
      'postgresql',
      true,
    );
    expect(result.failed).toEqual([]);
    expect(result.results[0].indexes[0].name).toBe('"users_pkey"');
  });
});
