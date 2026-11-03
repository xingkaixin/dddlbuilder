import { describe, expect, it } from 'vitest';
import { buildDDL, buildDCL } from '../utils/ddlGenerators';
import type { NormalizedField } from '@ddlbuilder/shared-types';

describe('DDL generation', () => {
  const sampleFields: NormalizedField[] = [
    {
      name: 'id',
      type: 'int',
      comment: '主键ID',
      nullable: false,
      defaultKind: 'auto_increment',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'name',
      type: 'varchar(255)',
      comment: '名称',
      nullable: true,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'created_at',
      type: 'timestamp',
      comment: '创建时间',
      nullable: false,
      defaultKind: 'current_timestamp',
      defaultValue: '',
      onUpdate: 'none',
    },
    {
      name: 'price',
      type: 'decimal(10,2)',
      comment: '价格',
      nullable: true,
      defaultKind: 'constant',
      defaultValue: '0.00',
      onUpdate: 'none',
    },
  ];

  it('should generate UUID default expression for character columns', () => {
    const fields: NormalizedField[] = [
      {
        name: 'trace_id',
        type: 'uuid',
        comment: '',
        nullable: false,
        defaultKind: 'uuid',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];

    const result = buildDDL({ dbType: 'mysql', tableName: 'events', tableComment: '', fields });

    expect(result).toContain('trace_id CHAR(36) NOT NULL DEFAULT (UUID())');
  });

  it('should generate SQL Server DDL', () => {
    const result = buildDDL({
      dbType: 'sqlserver',
      tableName: 'dbo.users',
      tableComment: '用户表',
      fields: sampleFields,
    });

    expect(result).toContain('CREATE TABLE dbo.users');
    expect(result).toContain('id INT IDENTITY(1,1) NOT NULL');
    expect(result).toContain('name VARCHAR(255) NULL');
    expect(result).toContain('created_at DATETIME2 NOT NULL');
    expect(result).toContain('price DECIMAL(10, 2) NULL DEFAULT 0.00');
    expect(result).toContain('EXEC sp_addextendedproperty');
    expect(result).toContain("N'MS_Description'");
  });

  it('should filter empty authorization objects', () => {
    const result = buildDCL('users', ['CBD_READ', '', '  ', 'CBD_RW']);

    expect(result).toContain('GRANT SELECT ON users TO CBD_READ;');
    expect(result).toContain('GRANT SELECT ON users TO CBD_RW;');
    expect(result).not.toContain("GRANT SELECT ON users TO '';");
    expect(result).not.toContain("GRANT SELECT ON users TO '  ';");
  });

  it('qualifies PostgreSQL table and column comments', () => {
    const result = buildDDL({
      dbType: 'postgresql',
      tableName: 'public.users',
      tableComment: '用户表',
      fields: sampleFields,
    });
    expect(result).toContain('CREATE TABLE public.users');
    expect(result).toContain('public.users.name');
  });
});
