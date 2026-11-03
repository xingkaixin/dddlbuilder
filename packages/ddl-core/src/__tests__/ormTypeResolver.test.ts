import { describe, expect, it } from 'vitest';
import { mapCanonicalToORMType, getORMTypeWithArgs } from '../utils/ormTypeResolver';
import { buildORM } from '../utils/ormGenerators';
import { buildPrimaryKeyName } from '../utils/primaryKeyNaming';

describe('mapCanonicalToORMType', () => {
  it.each(['prisma'] as const)(
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
});

describe('getORMTypeWithArgs', () => {
  it('includes args for SQLAlchemy Numeric type', () => {
    expect(getORMTypeWithArgs('sqlalchemy', 'decimal(10,2)')).toBe('Numeric(10, 2)');
  });
});

describe('buildPrimaryKeyName', () => {
  it('truncates generated names to the requested dialect limit', () => {
    const name = buildPrimaryKeyName(`schema.${'long_table_name_'.repeat(4)}`, 30);

    expect(name).toHaveLength(30);
    expect(name).toMatch(/_[a-z0-9]{4}$/);
  });
});
