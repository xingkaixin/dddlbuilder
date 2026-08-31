import { describe, expect, it } from 'vitest';
import { mapCanonicalToORMType, getORMTypeWithArgs } from '../utils/ormTypeResolver';
import { buildORM } from '../utils/ormGenerators';
import { buildPrimaryKeyName } from '../utils/primaryKeyNaming';

describe('mapCanonicalToORMType', () => {
  it('maps varchar to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'varchar')).toBe('String');
    expect(mapCanonicalToORMType('typeorm', 'varchar')).toBe('string');
    expect(mapCanonicalToORMType('sqlalchemy', 'varchar')).toBe('String');
    expect(mapCanonicalToORMType('gorm', 'varchar')).toBe('string');
    expect(mapCanonicalToORMType('jpa', 'varchar')).toBe('String');
  });

  it('maps int to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'int')).toBe('Int');
    expect(mapCanonicalToORMType('typeorm', 'int')).toBe('number');
    expect(mapCanonicalToORMType('sqlalchemy', 'int')).toBe('Integer');
    expect(mapCanonicalToORMType('gorm', 'int')).toBe('int');
    expect(mapCanonicalToORMType('jpa', 'int')).toBe('Integer');
  });

  it('maps bigint to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'bigint')).toBe('BigInt');
    expect(mapCanonicalToORMType('typeorm', 'bigint')).toBe('number');
    expect(mapCanonicalToORMType('sqlalchemy', 'bigint')).toBe('BigInteger');
    expect(mapCanonicalToORMType('gorm', 'bigint')).toBe('int64');
    expect(mapCanonicalToORMType('jpa', 'bigint')).toBe('Long');
  });

  it('maps decimal to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'decimal')).toBe('Decimal');
    expect(mapCanonicalToORMType('typeorm', 'decimal')).toBe('number');
    expect(mapCanonicalToORMType('sqlalchemy', 'decimal')).toBe('Numeric');
    expect(mapCanonicalToORMType('gorm', 'decimal')).toBe('float64');
    expect(mapCanonicalToORMType('jpa', 'decimal')).toBe('BigDecimal');
  });

  it('maps timestamp to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'timestamp')).toBe('DateTime');
    expect(mapCanonicalToORMType('typeorm', 'timestamp')).toBe('Date');
    expect(mapCanonicalToORMType('sqlalchemy', 'timestamp')).toBe('DateTime');
    expect(mapCanonicalToORMType('gorm', 'timestamp')).toBe('time.Time');
    expect(mapCanonicalToORMType('jpa', 'timestamp')).toBe('Date');
  });

  it('maps boolean to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'boolean')).toBe('Boolean');
    expect(mapCanonicalToORMType('typeorm', 'boolean')).toBe('boolean');
    expect(mapCanonicalToORMType('sqlalchemy', 'boolean')).toBe('Boolean');
    expect(mapCanonicalToORMType('gorm', 'boolean')).toBe('bool');
    expect(mapCanonicalToORMType('jpa', 'boolean')).toBe('Boolean');
  });

  it('maps json to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'json')).toBe('Json');
    expect(mapCanonicalToORMType('typeorm', 'json')).toBe('object');
    expect(mapCanonicalToORMType('sqlalchemy', 'json')).toBe('JSON');
    expect(mapCanonicalToORMType('gorm', 'json')).toBe('string');
    expect(mapCanonicalToORMType('jpa', 'json')).toBe('String');
  });

  it('maps blob to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'blob')).toBe('Bytes');
    expect(mapCanonicalToORMType('typeorm', 'blob')).toBe('Buffer');
    expect(mapCanonicalToORMType('sqlalchemy', 'blob')).toBe('LargeBinary');
    expect(mapCanonicalToORMType('gorm', 'blob')).toBe('[]byte');
    expect(mapCanonicalToORMType('jpa', 'blob')).toBe('byte[]');
  });

  it('maps uuid to all ORM targets', () => {
    expect(mapCanonicalToORMType('prisma', 'uuid')).toBe('String');
    expect(mapCanonicalToORMType('typeorm', 'uuid')).toBe('string');
    expect(mapCanonicalToORMType('sqlalchemy', 'uuid')).toBe('String');
    expect(mapCanonicalToORMType('gorm', 'uuid')).toBe('string');
    expect(mapCanonicalToORMType('jpa', 'uuid')).toBe('UUID');
  });

  it('handles type aliases', () => {
    expect(mapCanonicalToORMType('prisma', 'integer')).toBe('Int');
    expect(mapCanonicalToORMType('prisma', 'bool')).toBe('Boolean');
    expect(mapCanonicalToORMType('prisma', 'numeric')).toBe('Decimal');
  });

  it('handles field type with arguments', () => {
    expect(mapCanonicalToORMType('prisma', 'varchar(255)')).toBe('String');
    expect(mapCanonicalToORMType('typeorm', 'decimal(10,2)')).toBe('number');
  });

  it.each(['prisma', 'typeorm', 'sqlalchemy', 'gorm', 'jpa'] as const)(
    'reports unsupported types without substituting strings for %s',
    (target) => {
      for (const type of ['unknown_type', '', '__proto__', 'constructor']) {
        expect(() => mapCanonicalToORMType(target, type)).toThrow('Unsupported');
        expect(() => getORMTypeWithArgs(target, type)).toThrow('Unsupported');
        expect(
          buildORM(target, {
            dbType: 'mysql',
            tableName: 'samples',
            tableComment: '',
            fields: [
              {
                name: 'value',
                type,
                comment: '',
                nullable: false,
                defaultKind: 'none',
                defaultValue: '',
                onUpdate: 'none',
              },
            ],
          }),
        ).toContain(`Manual mapping required: column "value" has unsupported ${target} type`);
      }
    },
  );

  it('maps national character fields to the target language', () => {
    expect(mapCanonicalToORMType('prisma', 'nchar(10)')).toBe('String');
    expect(mapCanonicalToORMType('typeorm', 'nchar(10)')).toBe('string');
    expect(getORMTypeWithArgs('sqlalchemy', 'nchar(10)')).toBe('String(10)');
    expect(mapCanonicalToORMType('gorm', 'national char(10)')).toBe('string');
    expect(mapCanonicalToORMType('jpa', 'nchar(10)')).toBe('String');
    expect(
      buildORM('gorm', {
        dbType: 'mysql',
        tableName: 'events',
        tableComment: '',
        fields: [
          {
            name: 'code',
            type: 'nchar(10)',
            comment: '',
            nullable: false,
            defaultKind: 'none',
            defaultValue: '',
            onUpdate: 'none',
          },
        ],
      }),
    ).toMatch(/Code\s+string\s+`gorm:"column:code"`/);
  });
});

describe('getORMTypeWithArgs', () => {
  it('returns base mapped type without args for most ORMs', () => {
    expect(getORMTypeWithArgs('prisma', 'varchar(255)')).toBe('String');
    expect(getORMTypeWithArgs('typeorm', 'varchar(255)')).toBe('string');
    expect(getORMTypeWithArgs('gorm', 'varchar(255)')).toBe('string');
    expect(getORMTypeWithArgs('jpa', 'varchar(255)')).toBe('String');
  });

  it('includes args for SQLAlchemy String type', () => {
    expect(getORMTypeWithArgs('sqlalchemy', 'varchar(255)')).toBe('String(255)');
    expect(getORMTypeWithArgs('sqlalchemy', 'varchar(100)')).toBe('String(100)');
  });

  it('includes args for SQLAlchemy LargeBinary type', () => {
    expect(getORMTypeWithArgs('sqlalchemy', 'varbinary(255)')).toBe('LargeBinary(255)');
  });

  it('includes args for SQLAlchemy Numeric type', () => {
    expect(getORMTypeWithArgs('sqlalchemy', 'decimal(10,2)')).toBe('Numeric(10, 2)');
  });

  it('returns base type without args when no args provided for SQLAlchemy', () => {
    expect(getORMTypeWithArgs('sqlalchemy', 'varchar')).toBe('String');
    expect(getORMTypeWithArgs('sqlalchemy', 'decimal')).toBe('Numeric');
  });

  it('handles int without args for SQLAlchemy', () => {
    expect(getORMTypeWithArgs('sqlalchemy', 'int')).toBe('Integer');
  });
});

describe('buildPrimaryKeyName', () => {
  it('builds pk name from simple table name', () => {
    expect(buildPrimaryKeyName('users')).toBe('pk_users');
  });

  it('builds pk name from table name with schema', () => {
    expect(buildPrimaryKeyName('public.users')).toBe('pk_users');
  });

  it('builds pk name from table name with multiple schema parts', () => {
    expect(buildPrimaryKeyName('db.schema.users')).toBe('pk_users');
  });

  it('trims whitespace from table name', () => {
    expect(buildPrimaryKeyName('  users  ')).toBe('pk_users');
  });

  it('returns pk for empty table name', () => {
    expect(buildPrimaryKeyName('')).toBe('pk');
  });

  it('returns pk for whitespace-only table name', () => {
    expect(buildPrimaryKeyName('   ')).toBe('pk');
  });

  it('truncates generated names to the requested dialect limit', () => {
    const name = buildPrimaryKeyName(`schema.${'long_table_name_'.repeat(4)}`, 30);

    expect(name).toHaveLength(30);
    expect(name).toMatch(/_[a-z0-9]{4}$/);
  });
});
