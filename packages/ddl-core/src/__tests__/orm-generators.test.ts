import { describe, expect, it } from 'vitest';
import type { NormalizedField, ForeignKeyDefinition } from '@ddlbuilder/shared-types';
import { PrismaGenerator } from '../generators/PrismaGenerator';
import { TypeORMGenerator } from '../generators/TypeORMGenerator';
import { SQLAlchemyGenerator } from '../generators/SQLAlchemyGenerator';
import { GORMGenerator } from '../generators/GORMGenerator';
import { JPAGenerator } from '../generators/JPAGenerator';

const createField = (overrides: Partial<NormalizedField> = {}): NormalizedField => ({
  name: 'id',
  type: 'bigint',
  comment: '',
  nullable: false,
  defaultKind: 'auto_increment',
  defaultValue: '',
  onUpdate: 'none',
  ...overrides,
});

describe('foreign key generation contract', () => {
  const fields = [
    createField(),
    createField({ name: 'tenant_id', type: 'bigint', defaultKind: 'none' }),
    createField({ name: 'user_id', type: 'bigint', defaultKind: 'none', nullable: true }),
    createField({
      name: 'created_at',
      type: 'timestamp',
      defaultKind: 'current_timestamp',
    }),
  ];
  const foreignKeys: ForeignKeyDefinition[] = [
    {
      id: 'fk-owner',
      name: 'fk_order_owner',
      fields: ['tenant_id', 'user_id'],
      refSchema: 'identity',
      refTable: 'users',
      refFields: ['tenant_id', 'id'],
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    },
  ];
  const referencedModels = [
    {
      schemaName: 'identity',
      tableName: 'users',
      fields: [{ name: 'tenant_id' }, { name: 'id' }],
    },
  ];

  it('emits usable relationship metadata for every target', () => {
    const outputs = {
      prisma: new PrismaGenerator().generateModel({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys,
        referencedModels,
      }),
      typeorm: new TypeORMGenerator().generateModel({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys,
        referencedModels,
      }),
      sqlalchemy: new SQLAlchemyGenerator().generateModel({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys,
      }),
      gorm: new GORMGenerator().generateModel({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys,
        referencedModels,
      }),
      jpa: new JPAGenerator().generateModel({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys,
      }),
    };
    expect(outputs.prisma).not.toContain('@@foreignKey');
    expect(outputs.prisma).toContain(
      '@relation(fields: [tenantId, userId], references: [tenantId, id]',
    );
    expect(outputs.typeorm).toContain('@ManyToOne(() => Users');
    expect(outputs.typeorm).toContain("@JoinColumn([{ name: 'tenant_id'");
    expect(outputs.sqlalchemy).toContain('func, ForeignKeyConstraint');
    expect(outputs.sqlalchemy).toContain(
      "ForeignKeyConstraint(['tenant_id', 'user_id'], ['identity.users.tenant_id', 'identity.users.id']",
    );
    expect(outputs.gorm).toContain('foreignKey:TenantId,UserId;references:TenantId,Id');
    expect(outputs.jpa).toContain('@ManyToOne');
    expect(outputs.jpa).toContain('@JoinColumns(value = {');
  });
});
