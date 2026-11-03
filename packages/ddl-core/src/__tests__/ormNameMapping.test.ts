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
  kind: 'primary',
});

describe('ORM database name mapping', () => {
  it('preserves Prisma table and column names while using properties in indexes', () => {
    const model = buildORM('prisma', {
      dbType: 'mysql',
      tableName: 'user_profile',
      tableComment: '',
      fields: [
        field('user_id', { defaultKind: 'auto_increment' }),
        field('display_name', { type: 'varchar(100)', nullable: true, comment: 'Display name' }),
        field('createdAt', { type: 'timestamp', defaultKind: 'current_timestamp' }),
      ],
      indexes: [
        primaryKey(['user_id']),
        {
          id: 'name',
          name: 'idx_display_name',
          fields: [{ name: 'display_name', direction: 'ASC' }],
          kind: 'index',
        },
      ],
    });

    expect(model).toContain('model UserProfile {');
    expect(model).toContain('@@map("user_profile")');
    expect(model).toMatch(/userId\s+Int\s+@id @default\(autoincrement\(\)\) @map\("user_id"\)/);
    expect(model).toMatch(/displayName\s+String\?\s+@map\("display_name"\)/);
    expect(model).toContain('/// Display name');
    expect(model).toContain('@@index([displayName])');
    expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(model).not.toContain('@map("createdAt")');
  });

  it('derives valid class names from table names while keeping physical table names', () => {
    const input = {
      dbType: 'mysql' as const,
      tableName: 'order-items',
      tableComment: '',
      fields: [field('id'), field('order_id')],
      indexes: [primaryKey(['id'])],
      foreignKeys: [
        {
          id: 'order',
          name: 'fk_order',
          fields: ['order_id'],
          refTable: '2024_orders',
          refFields: ['id'],
        },
      ],
      referencedModels: [{ tableName: '2024_orders', fields: [field('id')] }],
    };

    const prisma = buildORM('prisma', input);
    expect(prisma).toContain('model OrderItems {');
    expect(prisma).toContain('@@map("order-items")');
    expect(prisma).toContain('fkOrder Model_2024Orders @relation(');

    const typeorm = buildORM('typeorm', input);
    expect(typeorm).toContain("@Entity('order-items')");
    expect(typeorm).toContain('export class OrderItems {');
    expect(typeorm).toContain("import { Model_2024Orders } from './2024_orders';");
    expect(typeorm).toContain('@ManyToOne(() => Model_2024Orders)');

    const gorm = buildORM('gorm', input);
    expect(gorm).toContain('type OrderItems struct {');
    expect(gorm).toMatch(/FkOrder\s+Model_2024Orders\s/);
    expect(gorm).toContain('func (OrderItems) TableName() string {');
    expect(gorm).toContain('return "order-items"');

    const jpa = buildORM('jpa', input);
    expect(jpa).toContain('@Table(name = "order-items")');
    expect(jpa).toContain('public class OrderItems {');
    expect(jpa).toContain('private Model_2024Orders fkOrder;');

    const sqlalchemy = buildORM('sqlalchemy', input);
    expect(sqlalchemy).toContain('class OrderItems(Base):');
    expect(sqlalchemy).toContain("__tablename__ = 'order-items'");
  });

  it.each([
    {
      names: ['tenant_id', 'user_id'],
      expected:
        "@JoinColumn([{ name: 'tenant_id', referencedColumnName: 'tenantId', foreignKeyConstraintName: 'fk_owner' }, { name: 'user_id', referencedColumnName: 'userId' }])",
    },
  ])('uses TypeORM property names in foreign key references: $names', ({ names, expected }) => {
    const model = buildORM('typeorm', {
      dbType: 'mysql',
      tableName: 'membership',
      tableComment: '',
      fields: names.map((name) => field(name)),
      foreignKeys: [
        {
          id: 'owner',
          name: 'fk_owner',
          fields: names,
          refTable: 'user_profile',
          refFields: names,
        },
      ],
      referencedModels: [{ tableName: 'user_profile', fields: names.map((name) => field(name)) }],
    });

    expect(model).toContain(expected);
  });
});
