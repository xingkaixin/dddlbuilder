import { describe, expect, it } from 'vitest';
import { withDefaultEditorSession, type DatabaseType } from '@ddlbuilder/shared-types';
import { buildDDL, diffPersistedState, generateAlterDDL, generateRollbackDDL } from '../index';
import { SqlParser } from '../parser/SqlParser';

describe('column comment migrations', () => {
  it('round-trips SQL Server comments without an explicit schema', async () => {
    const sql = buildDDL({
      dbType: 'sqlserver',
      tableName: 'users',
      tableComment: "Owner's table; 活跃",
      fields: [
        {
          name: 'name',
          type: 'varchar(32)',
          comment: "Owner's name; 姓名",
          nullable: true,
          defaultKind: 'none',
          defaultValue: '',
          onUpdate: 'none',
        },
      ],
    });
    expect(sql).toContain('OBJECT_SCHEMA_NAME(OBJECT_ID(');
    expect(sql).not.toContain('@level0name = NULL');
    const parsed = await new SqlParser().parseAsync(sql, 'sqlserver');
    expect(parsed.tableComment).toBe("Owner's table; 活跃");
    expect(parsed.fields[0].comment).toBe("Owner's name; 姓名");
  });
  it.each(['postgresql', 'sqlserver', 'oracle', 'dm'] as const)(
    '%s keeps comments when adding columns',
    (dbType: DatabaseType) => {
      const field = {
        id: 'name',
        fieldName: 'name',
        fieldType: 'varchar(32)',
        fieldComment: '账户名称',
        nullable: true,
      };
      const before = withDefaultEditorSession({
        dbType,
        schemaName: 'app',
        tableName: 'users',
        tableComment: '',
        rows: [],
        indexes: [],
        authInput: '',
        authObjects: [],
      });
      const after = { ...before, rows: [field] };
      const create = buildDDL({
        dbType,
        tableName: 'app.users',
        tableComment: '',
        fields: [
          {
            name: 'name',
            type: 'varchar(32)',
            comment: field.fieldComment,
            nullable: true,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
          },
        ],
      });
      const alter = generateAlterDDL(diffPersistedState(before, after));
      expect(create).toContain('账户名称');
      expect(alter).toContain('账户名称');
    },
  );

  it.each([
    'postgresql',
    'postgresql-citus',
    'kingbase',
    'gaussdb',
    'oracle',
    'oceanbase-oracle',
    'dm',
    'sqlserver',
  ] as const)(
    '%s emits only comment statements for comment-only changes and rollback',
    (dbType) => {
      const before = withDefaultEditorSession({
        dbType,
        schemaName: 'app',
        tableName: 'users',
        tableComment: '',
        rows: [
          {
            id: 'name',
            fieldName: 'name',
            fieldType: 'varchar(32)',
            fieldComment: '原注释',
            nullable: true,
          },
        ],
        indexes: [],
        authInput: '',
        authObjects: [],
      });
      const after = {
        ...before,
        rows: before.rows.map((row) => ({ ...row, fieldComment: "Owner's name; 中文" })),
      };
      const diff = diffPersistedState(before, after);
      const forward = generateAlterDDL(diff);
      const rollback = generateRollbackDDL(diff);
      expect(forward).toContain("Owner''s name; 中文");
      expect(rollback).toContain('原注释');
      expect(forward).not.toContain('ALTER TABLE');
      expect(rollback).not.toContain('ALTER TABLE');
      expect(forward).toContain(
        dbType === 'sqlserver' ? 'sp_updateextendedproperty' : 'COMMENT ON COLUMN',
      );
    },
  );

  it.each(['postgresql', 'oracle', 'dm', 'sqlserver'] as const)(
    '%s adds and clears a comment reversibly',
    (dbType) => {
      const before = withDefaultEditorSession({
        dbType,
        schemaName: 'app',
        tableName: 'users',
        tableComment: '',
        rows: [
          {
            id: 'name',
            fieldName: 'name',
            fieldType: 'varchar(32)',
            fieldComment: '',
            nullable: true,
          },
        ],
        indexes: [],
        authInput: '',
        authObjects: [],
      });
      const after = {
        ...before,
        rows: before.rows.map((row) => ({ ...row, fieldComment: '姓名' })),
      };
      const diff = diffPersistedState(before, after);
      const forward = generateAlterDDL(diff);
      const rollback = generateRollbackDDL(diff);
      expect(forward).toContain('姓名');
      expect(rollback).toContain(dbType === 'sqlserver' ? 'sp_dropextendedproperty' : " IS '';");
      expect(forward).toContain(
        dbType === 'sqlserver' ? 'sp_addextendedproperty' : 'COMMENT ON COLUMN',
      );
      expect(rollback).not.toContain('@value');
    },
  );

  it('restores column comments when rolling back a dropped column', () => {
    const before = withDefaultEditorSession({
      dbType: 'postgresql',
      schemaName: 'audit',
      tableName: 'users',
      tableComment: '',
      rows: [
        {
          id: 'name',
          fieldName: 'name',
          fieldType: 'varchar(32)',
          fieldComment: '姓名',
          nullable: true,
        },
      ],
      indexes: [],
      authInput: '',
      authObjects: [],
    });
    const diff = diffPersistedState(before, { ...before, rows: [] });
    const rollback = generateRollbackDDL(diff);
    expect(rollback).toContain('ADD COLUMN name');
    expect(rollback).toContain("COMMENT ON COLUMN audit.users.name IS '姓名';");
  });

  it('uses unquoted object names for SQL Server extended properties', () => {
    const before = withDefaultEditorSession({
      dbType: 'sqlserver',
      schemaName: '[app space]',
      tableName: '[user table]',
      tableComment: '',
      rows: [],
      indexes: [],
      authInput: '',
      authObjects: [],
    });
    const after = {
      ...before,
      rows: [
        {
          id: 'name',
          fieldName: '[display name]',
          fieldType: 'varchar(32)',
          fieldComment: '名称',
          nullable: true,
        },
      ],
    };
    const sql = generateAlterDDL(diffPersistedState(before, after));
    expect(sql).toContain("@level0name = N'app space'");
    expect(sql).toContain("@level1name = N'user table'");
    expect(sql).toContain("@level2name = N'display name'");
  });
});
