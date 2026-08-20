import { describe, expect, it } from 'vitest';
import type { FieldRow, IndexDefinition } from '@ddlbuilder/shared-types';
import { lintSchema } from '@/utils/schemaLint';

const field = (fieldName: string, overrides: Partial<FieldRow> = {}): FieldRow => ({
  order: 1,
  fieldName,
  fieldType: 'varchar(255)',
  fieldComment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

const primaryIndex: IndexDefinition = {
  id: 'pk',
  name: 'pk_users',
  fields: [{ name: 'id', direction: 'ASC' }],
  unique: true,
  isPrimary: true,
};

describe('lintSchema', () => {
  it('returns no issues for a schema that follows baseline rules', () => {
    const issues = lintSchema({
      tableName: 'users',
      rows: [
        field('id', { fieldType: 'bigint', nullable: false, defaultKind: 'auto_increment' }),
        field('name'),
        field('created_at', {
          fieldType: 'timestamp',
          nullable: false,
          defaultKind: 'current_timestamp',
        }),
        field('updated_at', {
          fieldType: 'timestamp',
          nullable: false,
          defaultKind: 'current_timestamp',
          onUpdate: 'current_timestamp',
        }),
      ],
      indexes: [
        primaryIndex,
        {
          id: 'idx_name',
          name: 'idx_users_name',
          fields: [{ name: 'name', direction: 'ASC' }],
          unique: false,
        },
      ],
    });

    expect(issues).toEqual([]);
  });

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
          unique: false,
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
  });

  it('reports audit fields with weak conventions', () => {
    const issues = lintSchema({
      tableName: 'users',
      rows: [
        field('id', { fieldType: 'bigint', nullable: false }),
        field('created_at', { fieldType: 'varchar(30)' }),
        field('updated_at', { fieldType: 'datetime', defaultKind: 'current_timestamp' }),
      ],
      indexes: [primaryIndex],
    });

    expect(issues.map((issue) => issue.ruleId)).toEqual(
      expect.arrayContaining(['audit-field-type', 'created-at-default', 'updated-at-on-update']),
    );
  });

  it('reports large indexed fields', () => {
    const issues = lintSchema({
      tableName: 'events',
      rows: [
        field('id', { fieldType: 'bigint', nullable: false }),
        field('payload', { fieldType: 'json' }),
        field('created_at', { fieldType: 'timestamp', defaultKind: 'current_timestamp' }),
        field('updated_at', {
          fieldType: 'timestamp',
          defaultKind: 'current_timestamp',
          onUpdate: 'current_timestamp',
        }),
      ],
      indexes: [
        {
          ...primaryIndex,
          name: 'pk_events',
        },
        {
          id: 'idx_payload',
          name: 'idx_events_payload',
          fields: [{ name: 'payload', direction: 'ASC' }],
          unique: false,
        },
      ],
    });

    expect(issues.map((issue) => issue.ruleId)).toContain('large-type-index');
  });
});
