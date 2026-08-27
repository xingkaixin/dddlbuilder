import { describe, expect, it } from 'vitest';
import type { IndexDefinition, NormalizedField } from '@ddlbuilder/shared-types';
import { buildORM } from '../utils/ormGenerators';

const field = (name: string, overrides: Partial<NormalizedField> = {}): NormalizedField => ({
  name,
  type: 'int',
  comment: '',
  nullable: false,
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

describe('ORM database name mapping', () => {
  it('preserves Prisma table and column names while using properties in indexes', () => {
    const model = buildORM(
      'prisma',
      'user_profile',
      '',
      [
        field('user_id', { defaultKind: 'auto_increment' }),
        field('display_name', { type: 'varchar(100)', nullable: true, comment: 'Display name' }),
        field('createdAt', { type: 'timestamp', defaultKind: 'current_timestamp' }),
      ],
      [
        primaryKey(['user_id']),
        {
          id: 'name',
          name: 'idx_display_name',
          fields: [{ name: 'display_name', direction: 'ASC' }],
          unique: false,
        },
      ],
    );

    expect(model).toContain('model UserProfile {');
    expect(model).toContain('@@map("user_profile")');
    expect(model).toMatch(/userId\s+Int\s+@id @default\(autoincrement\(\)\) @map\("user_id"\)/);
    expect(model).toMatch(/displayName\s+String\?\s+@map\("display_name"\)/);
    expect(model).toContain('/// Display name');
    expect(model).toContain('@@index([displayName])');
    expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(model).not.toContain('@map("createdAt")');
  });

  it('keeps unchanged Prisma identifiers without redundant mappings', () => {
    const model = buildORM(
      'prisma',
      'UserProfile',
      '',
      [field('userId')],
      [primaryKey(['userId'])],
    );

    expect(model).toContain('model UserProfile {');
    expect(model).not.toContain('@map(');
  });

  it.each([
    { isPrimary: false, defaultKind: 'none', decorator: 'Column' },
    { isPrimary: true, defaultKind: 'none', decorator: 'PrimaryColumn' },
    { isPrimary: true, defaultKind: 'auto_increment', decorator: 'PrimaryGeneratedColumn' },
  ] as const)('maps TypeORM columns using @$decorator', ({ isPrimary, defaultKind, decorator }) => {
    const model = buildORM(
      'typeorm',
      'user_profile',
      '',
      [field('user_id', { defaultKind })],
      isPrimary ? [primaryKey(['user_id'])] : [],
    );

    expect(model).toContain("@Entity('user_profile')");
    expect(model).toContain(`@${decorator}({ name: "user_id" })`);
    expect(model).toContain('userId: number;');
  });

  it.each([
    {
      names: ['user_id'],
      expected:
        "@JoinColumn({ name: 'user_id', referencedColumnName: 'userId', foreignKeyConstraintName: 'fk_owner' })",
    },
    {
      names: ['tenant_id', 'user_id'],
      expected:
        "@JoinColumn([{ name: 'tenant_id', referencedColumnName: 'tenantId', foreignKeyConstraintName: 'fk_owner' }, { name: 'user_id', referencedColumnName: 'userId' }])",
    },
  ])('uses TypeORM property names in foreign key references: $names', ({ names, expected }) => {
    const model = buildORM(
      'typeorm',
      'membership',
      '',
      names.map((name) => field(name)),
      [],
      [
        {
          id: 'owner',
          name: 'fk_owner',
          fields: names,
          refTable: 'user_profile',
          refFields: names,
        },
      ],
    );

    expect(model).toContain(expected);
  });

  it('does not crash TypeORM generation for incomplete foreign key references', () => {
    expect(() =>
      buildORM(
        'typeorm',
        'membership',
        '',
        [field('user_id'), field('tenant_id')],
        [],
        [
          {
            id: 'owner',
            name: 'fk_owner',
            fields: ['user_id', 'tenant_id'],
            refTable: 'user_profile',
            refFields: ['user_id'],
          },
        ],
      ),
    ).not.toThrow();
  });
});
