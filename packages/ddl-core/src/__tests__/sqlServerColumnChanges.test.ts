import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession, type FieldRow } from '@ddlbuilder/shared-types';
import { diffPersistedState, generateAlterDDL, generateRollbackDDL } from '../index';

const dependencyNotice =
  '-- Manual migration required for foreign keys from other tables that reference changed columns or keys. Their definitions are not available in this single-table diff; coordinate those changes before running this SQL.\n\n';

const field: FieldRow = {
  id: 'id',
  fieldName: 'id',
  fieldType: 'int',
  fieldComment: '',
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
};
const state = (row: FieldRow) =>
  withDefaultEditorSession({
    dbType: 'sqlserver',
    schemaName: '',
    tableName: 'users',
    tableComment: '',
    rows: [row],
    indexes: [],
    authInput: '',
    authObjects: [],
  });
const sqlFor = (before: FieldRow, after: FieldRow) => {
  const diff = diffPersistedState(state(before), state(after));
  return {
    forward: generateAlterDDL(diff),
    rollback: generateRollbackDDL(diff),
  };
};

describe('SQL Server column changes', () => {
  it('still emits IDENTITY when adding a new column', () => {
    const before = { ...state(field), rows: [] };
    const after = state({ ...field, defaultKind: 'auto_increment' });
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toBe('ALTER TABLE users ADD id INT IDENTITY(1,1) NOT NULL;');
  });

  it('uses isolated batches for multiple default constraints', () => {
    const before = {
      ...state(field),
      rows: ['a', 'b'].map((name) => ({
        ...field,
        id: name,
        fieldName: name,
        defaultKind: 'constant' as const,
        defaultValue: '1',
      })),
    };
    const after = { ...before, rows: before.rows.map((row) => ({ ...row, defaultValue: '2' })) };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql.match(/EXEC sys\.sp_executesql N'DECLARE/g)).toHaveLength(2);
    expect(sql).toContain('ADD DEFAULT 2 FOR a;');
    expect(sql).toContain('ADD DEFAULT 2 FOR b;');
  });

  it('adds and removes defaults without altering column type', () => {
    const sql = sqlFor(field, { ...field, defaultKind: 'constant', defaultValue: '2' });
    expect(sql.forward).toBe('ALTER TABLE users ADD DEFAULT 2 FOR id;');
    expect(sql.rollback).toContain('sys.default_constraints');
    expect(sql.rollback).not.toContain('ADD DEFAULT');
    expect(sql.rollback).not.toContain('ALTER COLUMN');
  });

  it('recreates an unchanged default around a type change', () => {
    const before = { ...field, defaultKind: 'constant' as const, defaultValue: '1' };
    const sql = sqlFor(before, { ...before, fieldType: 'bigint' });
    expect(sql.forward).toContain('ALTER TABLE users ALTER COLUMN id BIGINT NOT NULL;');
    expect(sql.forward.indexOf('DROP CONSTRAINT')).toBeLessThan(
      sql.forward.indexOf('ALTER COLUMN'),
    );
    expect(sql.forward.indexOf('ALTER COLUMN')).toBeLessThan(
      sql.forward.indexOf('ADD DEFAULT 1 FOR id'),
    );
    expect(sql.rollback).toContain('ALTER COLUMN id INT NOT NULL;');
    expect(sql.rollback).toContain('ADD DEFAULT 1 FOR id;');
  });

  it('leaves defaults untouched when only nullability changes', () => {
    const before = { ...field, defaultKind: 'constant' as const, defaultValue: '1' };
    const sql = sqlFor(before, { ...before, nullable: true });
    expect(sql.forward).toBe('ALTER TABLE users ALTER COLUMN id INT NULL;');
    expect(sql.rollback).toBe('ALTER TABLE users ALTER COLUMN id INT NOT NULL;');
  });

  it.each(['constant', 'expression', 'current_timestamp', 'uuid'] as const)(
    'uses the shared default renderer for %s',
    (defaultKind) => {
      const before = { ...field, fieldType: defaultKind === 'uuid' ? 'uuid' : 'datetime' };
      const defaults = {
        constant: "'2026-08-27'",
        expression: 'GETDATE()',
        current_timestamp: 'GETDATE()',
        uuid: 'NEWID()',
      };
      const sql = sqlFor(before, {
        ...before,
        defaultKind,
        defaultValue: defaultKind === 'constant' ? '2026-08-27' : 'GETDATE()',
      });
      expect(sql.forward).toBe(`ALTER TABLE users ADD DEFAULT ${defaults[defaultKind]} FOR id;`);
    },
  );

  it('looks up the real default constraint with safely escaped table and column names', () => {
    const before = {
      ...state({ ...field, fieldName: "Owner's]Id", defaultKind: 'constant', defaultValue: '1' }),
      schemaName: 'Audit.Schema',
      tableName: "User's]Log",
    };
    const after = { ...before, rows: before.rows.map((row) => ({ ...row, defaultValue: '2' })) };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    const batch = sql.match(/^EXEC sys\.sp_executesql N'((?:[^']|'')*)';/)?.[1].replace(/''/g, "'");
    expect(batch).toContain("OBJECT_ID(N'[Audit.Schema].[User''s]]Log]')");
    expect(batch).toContain("c.name = N'Owner''s]Id'");
    expect(batch).toContain('QUOTENAME(d.name)');
    expect(batch).toContain('d.parent_column_id = c.column_id');
    expect(sql).toContain(
      "ALTER TABLE [Audit.Schema].[User's]]Log] ADD DEFAULT 2 FOR [Owner's]]Id];",
    );
  });

  it('drops the default constraint before dropping its column, including rollback of additions', () => {
    const before = state({ ...field, defaultKind: 'constant', defaultValue: '1' });
    const after = { ...before, rows: [] };
    const diff = diffPersistedState(before, after);
    const sql = generateAlterDDL(diff);
    expect(sql.indexOf('DROP CONSTRAINT')).toBeLessThan(sql.indexOf('DROP COLUMN id'));
    const reverse = diffPersistedState(after, before);
    expect(generateRollbackDDL(reverse)).toBe(sql);
    expect(generateAlterDDL(reverse)).toContain('ADD id INT NOT NULL DEFAULT 1;');
  });

  it.each(['none', 'constant'] as const)(
    'requires manual migration for identity transitions from %s in both directions',
    (defaultKind) => {
      const before = state({ ...field, defaultKind, defaultValue: '1' });
      const after = {
        ...before,
        tableName: 'accounts',
        rows: [{ ...field, defaultKind: 'auto_increment' as const }],
      };
      const diff = diffPersistedState(before, after);
      for (const sql of [generateAlterDDL(diff), generateRollbackDDL(diff)]) {
        expect(sql).toContain('Manual migration required');
        expect(sql).toContain('IDENTITY');
        expect(sql).toContain('This column modification was skipped');
        expect(sql).not.toContain('ALTER TABLE');
        expect(sql).toContain('sp_rename');
      }
    },
  );

  it('changes defaults through constraints, not ALTER COLUMN', () => {
    const sql = sqlFor(
      { ...field, defaultKind: 'constant', defaultValue: '1' },
      { ...field, defaultKind: 'constant', defaultValue: '2' },
    );
    expect(sql.forward).not.toContain('ALTER COLUMN');
    expect(sql.forward).toContain('sys.default_constraints');
    expect(sql.forward).toContain('ADD DEFAULT 2 FOR id');
    expect(sql.rollback).toContain('ADD DEFAULT 1 FOR id');
  });

  it('changes an identity column type without repeating IDENTITY', () => {
    const before = { ...field, defaultKind: 'auto_increment' as const };
    const sql = sqlFor(before, { ...before, fieldType: 'bigint' });
    expect(sql.forward).toBe(
      dependencyNotice + 'ALTER TABLE users ALTER COLUMN id BIGINT NOT NULL;',
    );
    expect(sql.rollback).toBe(dependencyNotice + 'ALTER TABLE users ALTER COLUMN id INT NOT NULL;');
  });
});
