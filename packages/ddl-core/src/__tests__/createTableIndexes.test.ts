import { describe, expect, it } from 'vitest';
import { buildDDL } from '../utils/ddlGenerators';
import type { IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';

const field: NormalizedField = {
  name: 'id',
  type: 'int',
  comment: '',
  nullable: false,
  defaultKind: 'auto_increment',
  defaultValue: '',
  onUpdate: 'none',
};
const primary: IndexDefinition = {
  id: 'primary',
  name: 'pk_users',
  fields: [{ name: 'id', direction: 'ASC' }],
  kind: 'primary',
};

describe('table creation with indexes', () => {
  it.each(['mysql', 'mariadb', 'tidb', 'oceanbase', 'gbase', 'polardb'] as const)(
    '%s creates the identity column and its primary key together',
    (dbType) => {
      const ddl = buildDDL({
        dbType,
        tableName: 'users',
        tableComment: '',
        fields: [field],
        indexes: [primary],
      });
      expect(ddl.split(';')[0]).toContain('PRIMARY KEY (id ASC)');
      expect(ddl).not.toContain('ALTER TABLE');
      expect(ddl.match(/PRIMARY KEY/g)).toHaveLength(1);
    },
  );

  it.each([false, true])('allows a non-primary supporting index (unique=%s)', (unique) => {
    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields: [field],
      indexes: [{ ...primary, name: 'index name', kind: unique ? 'unique_index' : 'index' }],
    });
    expect(ddl.split(';')[0]).toContain(`${unique ? 'UNIQUE ' : ''}INDEX \`index name\` (id ASC)`);
    expect(ddl).not.toContain('PRIMARY KEY');
  });

  it('keeps partition clauses attached to the indexed table', () => {
    const ddl = buildDDL({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields: [field],
      indexes: [primary],
      mysqlPartitionConfig: {
        enabled: true,
        type: 'HASH',
        columns: ['id'],
        partitionCount: 4,
        partitions: [],
      },
    });
    expect(ddl.split(';')[0]).toContain('PRIMARY KEY (id ASC)');
    expect(ddl.split(';')[0]).toContain('PARTITION BY HASH');
  });

  it('preserves independent index statements for PostgreSQL', () => {
    const ddl = buildDDL({
      dbType: 'postgresql',
      tableName: 'users',
      tableComment: '',
      fields: [field],
      indexes: [primary],
    });
    expect(ddl.split(';')[0]).not.toContain('PRIMARY KEY');
    expect(ddl).toContain('ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id);');
  });
});
