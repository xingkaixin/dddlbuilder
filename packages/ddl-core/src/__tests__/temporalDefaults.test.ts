import { describe, expect, it } from 'vitest';
import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import { buildDDL, generateModifyColumn } from '../index';

const field: NormalizedField = {
  name: 'created_at',
  type: 'datetime(6)',
  comment: '',
  nullable: false,
  defaultKind: 'current_timestamp',
  defaultValue: '',
  onUpdate: 'none',
};

describe('temporal defaults after dialect conversion', () => {
  it.each<{
    dbType: DatabaseType;
    type: string;
    column: string;
    defaultClause: string;
  }>([
    {
      dbType: 'postgresql',
      type: 'datetime(6)',
      column: 'created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP',
      defaultClause: 'DEFAULT CURRENT_TIMESTAMP',
    },
    {
      dbType: 'oracle',
      type: 'datetime(6)',
      column: 'created_at TIMESTAMP(6) DEFAULT SYSTIMESTAMP NOT NULL',
      defaultClause: 'DEFAULT SYSTIMESTAMP',
    },
    {
      dbType: 'oracle',
      type: 'timestamp(6) with time zone',
      column: 'created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT SYSTIMESTAMP NOT NULL',
      defaultClause: 'DEFAULT SYSTIMESTAMP',
    },
  ])(
    'preserves $type defaults in $dbType CREATE and ALTER',
    ({ dbType, type, column, defaultClause }) => {
      const current = { ...field, type };
      const ddl = buildDDL({
        dbType,
        tableName: 'events',
        tableComment: '',
        fields: [current],
      });
      const alter = generateModifyColumn(
        'events',
        {
          type: 'modify',
          fieldName: current.name,
          oldField: { ...current, defaultKind: 'none' },
          newField: current,
          changes: ['default'],
        },
        dbType,
      );

      expect(ddl).toContain(column);
      expect(alter).toContain(defaultClause);
    },
  );

  it('preserves the default and ON UPDATE when datetime2 becomes MySQL DATETIME', () => {
    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: 'events',
      tableComment: '',
      fields: [{ ...field, type: 'datetime2(6)', onUpdate: 'current_timestamp' }],
    });

    expect(ddl).toContain(
      'created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
    );
  });
});
