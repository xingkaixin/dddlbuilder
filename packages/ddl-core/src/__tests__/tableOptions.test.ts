import { describe, expect, it } from 'vitest';
import type { DatabaseType, NormalizedField, TableMiscConfig } from '@ddlbuilder/shared-types';
import { buildDDL } from '../index';

const field: NormalizedField = {
  name: 'id',
  type: 'int',
  nullable: false,
  comment: '',
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
};

const config: TableMiscConfig = {
  enabled: true,
  engine: 'InnoDB',
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci',
  tablespace: 'app_data',
  fillfactor: 80,
  pctfree: 10,
  initrans: 2,
};

describe('table options in generated DDL', () => {
  it.each<{
    dbType: DatabaseType;
    clause: string;
  }>([
    { dbType: 'postgresql', clause: 'WITH (fillfactor = 80) TABLESPACE app_data' },
    { dbType: 'postgresql-citus', clause: 'WITH (fillfactor = 80) TABLESPACE app_data' },
    { dbType: 'kingbase', clause: 'WITH (fillfactor = 80) TABLESPACE app_data' },
    { dbType: 'gaussdb', clause: 'WITH (fillfactor = 80) TABLESPACE app_data' },
    { dbType: 'oracle', clause: 'PCTFREE 10 INITRANS 2 TABLESPACE app_data' },
    { dbType: 'oceanbase-oracle', clause: 'PCTFREE 10 INITRANS 2 TABLESPACE app_data' },
    {
      dbType: 'mysql',
      clause: 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    },
    { dbType: 'dm', clause: 'TABLESPACE app_data' },
  ])('combines supported options using $dbType grammar', ({ dbType, clause }) => {
    const ddl = buildDDL({
      dbType,
      tableName: 'items',
      tableComment: '',
      fields: [field],
      tableMiscConfig: config,
    });

    expect(ddl).toContain(`) ${clause};`);
  });
});
