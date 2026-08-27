import { describe, expect, it } from 'vitest';
import type { IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';
import { buildORM } from '../utils/ormGenerators';

const field = (name: string, overrides: Partial<NormalizedField> = {}): NormalizedField => ({
  name,
  type: 'int',
  comment: '',
  nullable: true,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

const primaryKey = (names: string[]): IndexDefinition => ({
  id: 'pk',
  name: 'PRIMARY',
  fields: names.map((name) => ({ name, direction: 'ASC' })),
  unique: true,
  isPrimary: true,
});

describe('Prisma primary keys', () => {
  it('emits one compound key in index order instead of separate field IDs', () => {
    const model = buildORM(
      'prisma',
      'membership',
      '',
      [field('tenant_id'), field('user_id'), field('label', { type: 'varchar(100)' })],
      [primaryKey(['user_id', 'tenant_id'])],
    );

    expect(model).toContain('@@id([userId, tenantId])');
    expect(model.match(/@@id\(/g)).toHaveLength(1);
    expect(model).not.toMatch(/\s@id\b/);
    expect(model).not.toContain('Int?');
    expect(model).toMatch(/label\s+String\?/);
    expect(model).toContain('@map("tenant_id")');
    expect(model).toContain('@map("user_id")');
    expect(model).not.toContain('@@unique(');
  });

  it.each([
    { names: ['id'], fieldIds: 1, compoundIds: 0 },
    { names: ['id', 'tenant_id'], fieldIds: 0, compoundIds: 1 },
  ])(
    'preserves auto increment defaults for primary columns: $names',
    ({ names, fieldIds, compoundIds }) => {
      const model = buildORM(
        'prisma',
        'membership',
        '',
        [field('id', { defaultKind: 'auto_increment' }), field('tenant_id')],
        [primaryKey(names)],
      );

      expect(model).toMatch(/id\s+Int\s+(?:@id )?@default\(autoincrement\(\)\)/);
      expect(model.match(/\s@id\b/g) ?? []).toHaveLength(fieldIds);
      expect(model.match(/@@id\(/g) ?? []).toHaveLength(compoundIds);
    },
  );

  it('does not turn a compound unique index into a primary key', () => {
    const model = buildORM(
      'prisma',
      'membership',
      '',
      [field('id'), field('tenant_id', { nullable: false }), field('user_id', { nullable: false })],
      [
        primaryKey(['id']),
        {
          ...primaryKey(['tenant_id', 'user_id']),
          id: 'unique',
          name: 'uk_user',
          isPrimary: false,
        },
      ],
    );

    expect(model).toMatch(/id\s+Int\s+@id\b/);
    expect(model).toContain('@@unique([tenantId, userId])');
    expect(model).not.toContain('@@id(');
  });
});
