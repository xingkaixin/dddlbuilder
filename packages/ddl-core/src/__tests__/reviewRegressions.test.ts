import { describe, expect, it } from 'vitest';
import {
  withDefaultEditorSession,
  type NormalizedField,
  type DatabaseType,
} from '@ddlbuilder/shared-types';
import { getFieldTypeForDatabase } from '../utils/databaseTypeMapping';
import { buildDialectColumn } from '../strategies/dialectColumn';
import { diffPersistedState } from '../utils/tableDiff';
import { generateAlterDDL } from '../utils/alter-ddl/generateAlterDDL';
import { buildDDL } from '../utils/ddlGenerators';
import { generateRenameTable, generateTableSchemaChange } from '../utils/alter-ddl/tableStatements';
import { formatSqlIdentifier } from '../utils/sqlIdentifiers';

const field: NormalizedField = {
  name: 'uid',
  type: 'int',
  comment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
};
const state = (id: string, name = 'email') =>
  withDefaultEditorSession({
    schemaName: '',
    tableName: 'users',
    dbType: 'postgresql',
    tableComment: '',
    rows: [
      {
        id,
        fieldName: name,
        fieldType: 'varchar(255)',
        fieldComment: '',
        nullable: true,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ],
    indexes: [],
    authInput: '',
    authObjects: [],
  });

describe('review DDL regressions', () => {
  it.each<[DatabaseType, string, string]>([
    ['postgresql', 'int(11)', 'INTEGER'],
    ['postgresql', 'float(10,2)', 'DOUBLE PRECISION'],
    ['sqlserver', 'int(11)', 'INT'],
    ['sqlserver', 'float(10,2)', 'FLOAT(10)'],
    ['hive', 'tinyint(1)', 'TINYINT'],
  ])('limits target parameters for %s %s', (db, type, expected) => {
    const output = getFieldTypeForDatabase(db, type);
    expect(output).toBe(expected);
  });
  it('matches database names even when editor IDs were regenerated', () => {
    const diff = diffPersistedState(state('a'), state('b'));
    expect(diff.fields).toEqual([]);
  });
  it('does not infer column identity from coincidentally identical attributes', () => {
    const diff = diffPersistedState(state('', 'created_by'), state('', 'updated_by'));
    expect(diff.fields.map((change) => change.type)).toEqual(['remove', 'add']);
  });
  it('preserves supported CREATE and ALTER work beside an unsupported foreign key', () => {
    const fk = {
      id: 'fk',
      name: 'fk_uid',
      fields: ['uid'],
      refTable: 'users',
      refFields: ['id'],
      onUpdate: 'CASCADE' as const,
      onDelete: 'NO ACTION' as const,
    };
    const sql = buildDDL({
      dbType: 'oracle',
      tableName: 'orders',
      tableComment: '',
      fields: [field],
      foreignKeys: [fk],
    });
    const before = { ...state('a'), dbType: 'oracle' as const, rows: [] };
    const after = {
      ...before,
      rows: [{ ...state('a').rows[0], fieldName: 'uid' }],
      foreignKeys: [fk],
    };
    const alter = generateAlterDDL('orders', diffPersistedState(before, after), [field], 'oracle');
    expect(sql).toContain('CREATE TABLE');
    expect(sql).toContain('Manual migration required');
    expect(alter).toContain('ADD');
    expect(alter).toContain('Manual migration required');
  });
  it('retains timestamp precision, timezone and defaults', () => {
    const column = buildDialectColumn(
      { ...field, type: 'timestamp(6) with time zone', defaultKind: 'current_timestamp' },
      'postgresql',
    );
    expect(column.body).toContain('TIMESTAMP(6) WITH TIME ZONE');
    expect(column.body).toContain('DEFAULT CURRENT_TIMESTAMP');
  });
  it.each(['gbase', 'polardb', 'kingbase', 'gaussdb', 'postgresql-citus'] as const)(
    'uses the family for %s schema moves',
    (db) => {
      const sql = generateTableSchemaChange('old.users', 'next', db);
      expect(sql).not.toBeNull();
    },
  );
  it.each(['gbase', 'polardb'] as const)('keeps the qualified rename target for %s', (db) => {
    expect(generateRenameTable('old.users', 'next.accounts', db)).toContain('next.accounts');
  });
  it.each(['date', 'timestamp', 'user'])('quotes Hive reserved identifier %s', (name) => {
    const output = formatSqlIdentifier(name, 'hive');
    expect(output).toBe('`' + name + '`');
  });
});
