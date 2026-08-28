import { describe, expect, it } from 'vitest';
import type { DatabaseType, NormalizedField } from '@ddlbuilder/shared-types';
import { buildORM } from '../utils/ormGenerators';

const field = (type: string, overrides: Partial<NormalizedField> = {}): NormalizedField => ({
  name: 'value',
  type,
  comment: '',
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

const generate = (dbType: DatabaseType, type: string, overrides: Partial<NormalizedField> = {}) =>
  buildORM('typeorm', {
    dbType,
    tableName: 'sample',
    tableComment: '',
    fields: [field(type, overrides)],
  });

describe('TypeORM database column types', () => {
  it.each([
    ['int', 'type: "int"', 'number'],
    ['bigint', 'type: "bigint"', 'string'],
    ['decimal(12,2)', 'type: "decimal", precision: 12, scale: 2', 'string'],
    ['float(10,4)', 'type: "float", precision: 10, scale: 4', 'number'],
    ['double', 'type: "double"', 'number'],
    ['bit(8)', 'type: "bit", width: 8', 'Buffer'],
    ['varchar(20)', 'type: "varchar", length: 20', 'string'],
    ['varchar(1000)', 'type: "varchar", length: 1000', 'string'],
    ['text', 'type: "text"', 'string'],
  ])(
    'preserves the SQL type %s instead of inferring from TypeScript',
    (type, options, propertyType) => {
      const model = generate('mysql', type);
      expect(model).toContain(`@Column({ ${options} })`);
      expect(model).toContain(`value: ${propertyType};`);
    },
  );

  it('keeps explicit types alongside nullability, names and defaults', () => {
    const model = generate('mysql', 'decimal(18,4) unsigned', {
      name: 'total_amount',
      nullable: true,
      defaultKind: 'constant',
      defaultValue: '0',
      comment: 'Total',
    });
    expect(model).toContain('type: "decimal", unsigned: true, precision: 18, scale: 4');
    expect(model).toContain('name: "total_amount", nullable: true');
    expect(model).toContain("default: '0'");
    expect(model).toContain('totalAmount: string | null;');
  });

  it.each([
    {
      dbType: 'postgresql',
      type: 'decimal(12,2)',
      options: 'type: "numeric", precision: 12, scale: 2',
    },
    { dbType: 'postgresql-citus', type: 'double', options: 'type: "double precision"' },
    {
      dbType: 'postgresql',
      type: 'timestamptz(3)',
      options: 'type: "timestamp with time zone", precision: 3',
    },
    { dbType: 'sqlserver', type: 'text', options: 'type: "nvarchar", length: "MAX"' },
    {
      dbType: 'sqlserver',
      type: 'decimal(18,4)',
      options: 'type: "decimal", precision: 18, scale: 4',
    },
    { dbType: 'oracle', type: 'varchar(100)', options: 'type: "varchar2", length: 100' },
    { dbType: 'oracle', type: 'decimal(18,4)', options: 'type: "number", precision: 18, scale: 4' },
  ] satisfies { dbType: DatabaseType; type: string; options: string }[])(
    'uses the shared DDL mapping for $dbType $type',
    ({ dbType, type, options }) =>
      expect(generate(dbType, type)).toContain(`@Column({ ${options} })`),
  );

  it.each(['postgresql', 'mysql'] as const)(
    'retains exact numeric values as strings for %s',
    (dbType) => {
      expect(generate(dbType, 'decimal(30,10)')).toContain('value: string;');
      expect(generate(dbType, 'bigint')).toContain('value: string;');
    },
  );

  it('keeps native binary and UUID property types after dialect conversion', () => {
    expect(generate('postgresql', 'blob')).toContain('value: Buffer;');
    expect(generate('oracle', 'varbinary(100)')).toContain('value: Buffer;');
    expect(generate('sqlserver', 'uuid')).toContain('value: string;');
    expect(generate('postgresql', 'timestamptz(3)')).toContain('value: Date;');
    expect(generate('oracle', 'double')).toContain('value: number;');
  });

  it.each(['none', 'auto_increment'] as const)(
    'preserves bigint primary keys with default $0',
    (defaultKind) => {
      const model = buildORM('typeorm', {
        dbType: 'mysql',
        tableName: 'sample',
        tableComment: '',
        fields: [field('bigint unsigned', { defaultKind })],
        indexes: [
          {
            id: 'pk',
            name: 'PRIMARY',
            fields: [{ name: 'value', direction: 'ASC' }],
            kind: 'primary',
          },
        ],
      });
      const decorator =
        defaultKind === 'auto_increment' ? 'PrimaryGeneratedColumn' : 'PrimaryColumn';
      expect(model).toContain(`@${decorator}({ type: "bigint", unsigned: true })`);
      expect(model).toContain('value: string;');
    },
  );

  it('represents PostgreSQL serial using an integer generation strategy', () => {
    expect(generate('postgresql', 'serial')).toContain(
      '@Column({ type: "integer", generated: \'increment\' })',
    );
  });

  it.each(['varchar(9007199254740992)', 'decimal(12,invalid)', 'decimal(12,2,3)'])(
    'does not round or silently drop unsupported type parameters in %s',
    (type) => {
      const model = generate('mysql', type);
      expect(model).toContain('Manual mapping required');
      expect(model).not.toContain('@Column(');
    },
  );
});
