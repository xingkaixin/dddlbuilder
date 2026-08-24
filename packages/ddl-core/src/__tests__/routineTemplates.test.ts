import { describe, expect, it } from 'vitest';
import type { DatabaseType, RoutineTemplateConfig } from '@ddlbuilder/shared-types';
import { buildRoutineTemplateDDL } from '../utils/routineTemplates';

type RoutineCase = [DatabaseType, RoutineTemplateConfig, string[]];

describe('buildRoutineTemplateDDL', () => {
  it('generates a PostgreSQL updated-at trigger with function wrapper', () => {
    const sql = buildRoutineTemplateDDL('postgresql', {
      kind: 'updated_at_trigger',
      routineName: 'trg_users_updated_at',
      tableName: 'public.users',
      timestampColumn: 'updated_at',
    });

    expect(sql).toContain('CREATE OR REPLACE FUNCTION trg_users_updated_at_fn()');
    expect(sql).toContain('NEW.updated_at = CURRENT_TIMESTAMP;');
    expect(sql).toContain('CREATE TRIGGER trg_users_updated_at');
    expect(sql).toContain('BEFORE UPDATE ON public.users');
  });

  it('generates a MySQL procedure with custom parameters and body', () => {
    const sql = buildRoutineTemplateDDL('mysql', {
      kind: 'procedure',
      routineName: 'sync_user_status',
      parameters: 'IN p_user_id INT',
      body: "UPDATE users SET status = 'active' WHERE id = p_user_id;",
    });

    expect(sql).toContain('CREATE PROCEDURE sync_user_status(IN p_user_id INT)');
    expect(sql).toContain("UPDATE users SET status = 'active' WHERE id = p_user_id");
    expect(sql).toContain('DELIMITER //');
  });

  it('generates a SQL Server audit trigger', () => {
    const sql = buildRoutineTemplateDDL('sqlserver', {
      kind: 'audit_trigger',
      routineName: 'trg_users_audit',
      tableName: 'dbo.users',
      auditTableName: 'dbo.users_audit',
    });

    expect(sql).toContain('CREATE OR ALTER TRIGGER trg_users_audit');
    expect(sql).toContain('AFTER INSERT, UPDATE, DELETE');
    expect(sql).toContain('INSERT INTO dbo.users_audit');
  });

  it('returns a prompt comment when trigger table is missing', () => {
    expect(
      buildRoutineTemplateDDL('mysql', {
        kind: 'custom_trigger',
        routineName: 'trg_users_validate',
      }),
    ).toBe('-- 请填写触发表名');
  });

  it.each<RoutineCase>([
    [
      'postgresql',
      { kind: 'procedure', routineName: 'refresh_stats', body: 'ANALYZE users;;' },
      ['CREATE OR REPLACE PROCEDURE refresh_stats()', 'LANGUAGE plpgsql', 'ANALYZE users;'],
    ],
    [
      'sqlserver',
      { kind: 'procedure', routineName: 'refresh_stats', parameters: '@force BIT' },
      ['CREATE OR ALTER PROCEDURE refresh_stats', '@force BIT', '-- 在这里编写过程逻辑;'],
    ],
    [
      'oracle',
      { kind: 'procedure', routineName: 'refresh_stats', parameters: 'force IN NUMBER' },
      ['CREATE OR REPLACE PROCEDURE refresh_stats(force IN NUMBER)', 'END;', '/'],
    ],
  ])('generates a %s procedure', (dbType, config, expectedFragments) => {
    const sql = buildRoutineTemplateDDL(dbType, config);

    expectedFragments.forEach((fragment) => expect(sql).toContain(fragment));
  });

  it.each<RoutineCase>([
    [
      'mysql',
      { kind: 'function', routineName: 'active_count' },
      ['CREATE FUNCTION active_count()', 'RETURNS INTEGER', 'RETURN 1;'],
    ],
    [
      'postgresql',
      {
        kind: 'function',
        routineName: 'active_count',
        parameters: 'tenant_id UUID',
        returnType: 'BIGINT',
      },
      ['CREATE OR REPLACE FUNCTION active_count(tenant_id UUID)', 'RETURNS BIGINT'],
    ],
    [
      'sqlserver',
      { kind: 'function', routineName: 'active_count', returnType: 'BIGINT' },
      ['CREATE OR ALTER FUNCTION active_count()', 'RETURNS BIGINT'],
    ],
    [
      'dm',
      { kind: 'function', routineName: 'active_count', parameters: 'tenant_id VARCHAR2' },
      ['CREATE OR REPLACE FUNCTION active_count(tenant_id VARCHAR2)', 'RETURN INTEGER'],
    ],
  ])('generates a %s function', (dbType, config, expectedFragments) => {
    const sql = buildRoutineTemplateDDL(dbType, config);

    expectedFragments.forEach((fragment) => expect(sql).toContain(fragment));
  });

  it.each<RoutineCase>([
    [
      'mysql',
      { kind: 'updated_at_trigger', routineName: 'touch_users', tableName: 'users' },
      ['BEFORE UPDATE ON users', 'SET NEW.updated_at = CURRENT_TIMESTAMP'],
    ],
    [
      'sqlserver',
      {
        kind: 'updated_at_trigger',
        routineName: 'touch_users',
        tableName: 'dbo.users',
        timestampColumn: 'modified_at',
      },
      ['CREATE OR ALTER TRIGGER touch_users', 'SET modified_at = SYSDATETIME()'],
    ],
    [
      'oracle',
      { kind: 'updated_at_trigger', routineName: 'touch_users', tableName: 'users' },
      ['BEFORE UPDATE ON users', ':NEW.updated_at := SYSTIMESTAMP'],
    ],
    [
      'mysql',
      { kind: 'audit_trigger', routineName: 'audit_users', tableName: 'users' },
      ['AFTER UPDATE ON users', 'INSERT INTO users_audit'],
    ],
    [
      'postgresql',
      { kind: 'audit_trigger', routineName: 'audit_users', tableName: 'public.users' },
      ['AFTER INSERT OR UPDATE OR DELETE ON public.users', 'TG_OP'],
    ],
    [
      'dm',
      { kind: 'audit_trigger', routineName: 'audit_users', tableName: 'users' },
      ['AFTER INSERT OR UPDATE OR DELETE ON users', 'ORA_SYSEVENT'],
    ],
    [
      'mysql',
      {
        kind: 'custom_trigger',
        routineName: 'validate_users',
        tableName: 'users',
        body: 'SET NEW.name = TRIM(NEW.name);;',
      },
      ['BEFORE INSERT ON users', 'SET NEW.name = TRIM(NEW.name);'],
    ],
    [
      'postgresql',
      { kind: 'custom_trigger', routineName: 'validate_users', tableName: 'users' },
      ['CREATE OR REPLACE FUNCTION validate_users_fn()', '-- 在这里编写触发器逻辑;'],
    ],
    [
      'sqlserver',
      { kind: 'custom_trigger', routineName: 'validate_users', tableName: 'dbo.users' },
      ['CREATE OR ALTER TRIGGER validate_users', 'SET NOCOUNT ON'],
    ],
    [
      'oracle',
      { kind: 'custom_trigger', routineName: 'validate_users', tableName: 'users' },
      ['BEFORE INSERT ON users', 'FOR EACH ROW'],
    ],
  ])('generates a %s trigger template', (dbType, config, expectedFragments) => {
    const sql = buildRoutineTemplateDDL(dbType, config);

    expectedFragments.forEach((fragment) => expect(sql).toContain(fragment));
  });

  it('returns guidance for unsupported or incomplete routines', () => {
    expect(
      buildRoutineTemplateDDL('hive', {
        kind: 'procedure',
        routineName: 'refresh_stats',
      }),
    ).toContain('Hive 不支持');
    expect(
      buildRoutineTemplateDDL('mysql', {
        kind: 'procedure',
        routineName: '   ',
      }),
    ).toBe('-- 请填写程序单元名称');
  });
});
