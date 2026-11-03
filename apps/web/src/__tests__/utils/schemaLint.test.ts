import { describe, expect, it } from 'vitest';
import type { FieldRow } from '@ddlbuilder/shared-types';
import { lintSchema } from '@/utils/schemaLint';

const field = (fieldName: string, overrides: Partial<FieldRow> = {}): FieldRow => ({
  id: `field-${fieldName}`,
  fieldName,
  fieldType: 'varchar(255)',
  fieldComment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

describe('lintSchema', () => {
  it('reports naming, primary key, audit, index, type and default issues', () => {
    const issues = lintSchema({
      tableName: 'UserProfile',
      rows: [
        field('UserID', { fieldType: 'bigint' }),
        field('amount', { fieldType: 'double' }),
        field('name', { fieldType: 'varchar' }),
        field('deleted_at', {
          fieldType: 'datetime',
          defaultKind: 'constant',
          defaultValue: '0000-00-00',
        }),
      ],
      indexes: [
        {
          id: 'idx_bad',
          name: 'bad_name',
          fields: [{ name: 'name', direction: 'ASC' }],
          kind: 'index',
        },
      ],
    });

    expect(issues.map((issue) => issue.ruleId)).toEqual(
      expect.arrayContaining([
        'table-name-snake-case',
        'field-name-snake-case',
        'primary-key-required',
        'audit-field-required',
        'index-name-convention',
        'money-decimal-required',
        'string-length-required',
        'zero-date-default',
      ]),
    );
    expect(issues.find((issue) => issue.ruleId === 'primary-key-required')?.severity).toBe('error');
    expect(issues[0]).not.toHaveProperty('title');
    expect(issues.find((issue) => issue.ruleId === 'index-name-convention')?.params).toEqual({
      expectedPrefix: 'idx_UserProfile_name',
    });
  });

  it('reports references to fields that do not exist', () => {
    const issues = lintSchema({
      tableName: 'users',
      rows: [field('id')],
      indexes: [
        {
          id: 'dangling-index',
          name: 'idx_users_missing',
          fields: [{ name: 'missing', direction: 'ASC' }],
          kind: 'index',
        },
      ],
      foreignKeys: [
        {
          id: 'dangling-fk',
          name: 'fk_users_account',
          fields: ['account_id'],
          refTable: 'accounts',
          refFields: ['id'],
        },
      ],
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: ['partition_key'],
      },
      citusShardingConfig: { mode: 'distributed', distributionColumn: 'tenant_id' },
      tableMiscConfig: {
        enabled: true,
        partitions: {
          enabled: true,
          columns: [],
          clustering: { enabled: true, columns: ['bucket_key'], bucketCount: 4 },
        },
      },
    });

    const danglingIssues = issues.filter((issue) => issue.ruleId === 'dangling-field-reference');
    expect(danglingIssues).toHaveLength(5);
    expect(danglingIssues.every((issue) => issue.severity === 'error')).toBe(true);
  });
});
