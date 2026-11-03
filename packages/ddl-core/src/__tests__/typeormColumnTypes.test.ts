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
    ['bigint', 'type: "bigint"', 'string'],
    ['decimal(12,2)', 'type: "decimal", precision: 12, scale: 2', 'string'],
  ])(
    'preserves the SQL type %s instead of inferring from TypeScript',
    (type, options, propertyType) => {
      const model = generate('mysql', type);
      expect(model).toContain(`@Column({ ${options} })`);
      expect(model).toContain(`value: ${propertyType};`);
    },
  );

  it.each([
    { dbType: 'sqlserver', type: 'text', options: 'type: "nvarchar", length: "MAX"' },
    { dbType: 'oracle', type: 'varchar(100)', options: 'type: "varchar2", length: 100' },
  ] satisfies { dbType: DatabaseType; type: string; options: string }[])(
    'uses the shared DDL mapping for $dbType $type',
    ({ dbType, type, options }) =>
      expect(generate(dbType, type)).toContain(`@Column({ ${options} })`),
  );

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

  it.each(['varchar(9007199254740992)'])(
    'does not round or silently drop unsupported type parameters in %s',
    (type) => {
      const model = generate('mysql', type);
      expect(model).toContain('Manual mapping required');
      expect(model).not.toContain('@Column(');
    },
  );
});
