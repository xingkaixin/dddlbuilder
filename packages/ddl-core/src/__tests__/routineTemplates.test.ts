import { describe, expect, it } from 'vitest';
import { buildRoutineTemplateDDL } from '../utils/routineTemplates';

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
});
