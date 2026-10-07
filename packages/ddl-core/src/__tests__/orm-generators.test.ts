import { describe, expect, it } from 'vitest';
import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';
import { PrismaGenerator } from '../generators/PrismaGenerator';
import { TypeORMGenerator } from '../generators/TypeORMGenerator';
import { SQLAlchemyGenerator } from '../generators/SQLAlchemyGenerator';
import { GORMGenerator } from '../generators/GORMGenerator';
import { JPAGenerator } from '../generators/JPAGenerator';
import {
  getPrimaryKeyFieldNames,
  buildIndexFieldLookup,
  toCamelCase,
  toPascalCase,
  escapePrismaDefault,
  escapePythonString,
  escapeJavaString,
} from '../generators/shared';

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

const createIndex = (overrides: Partial<IndexDefinition> = {}): IndexDefinition => ({
  id: 'index',
  name: 'pk_id',
  fields: [{ name: 'id', direction: 'ASC' }],
  kind: 'primary',

  ...overrides,
});

describe('shared utilities', () => {
  describe('getPrimaryKeyFieldNames', () => {
    it('returns empty when no primary index', () => {
      expect(getPrimaryKeyFieldNames([])).toEqual([]);
    });

    it('returns primary key field names', () => {
      const indexes: IndexDefinition[] = [
        createIndex({
          name: 'pk_id',
          fields: [
            { name: 'id', direction: 'ASC' },
            { name: 'org_id', direction: 'ASC' },
          ],
          kind: 'primary',
        }),
      ];
      expect(getPrimaryKeyFieldNames(indexes)).toEqual(['id', 'org_id']);
    });
  });

  describe('buildIndexFieldLookup', () => {
    it('precomputes primary and single-field unique membership', () => {
      const lookup = buildIndexFieldLookup([
        createIndex(),
        {
          id: 'unique-email',
          name: 'uq_email',
          fields: [{ name: 'email', direction: 'ASC' }],
          kind: 'unique_index',
        },
        {
          id: 'unique-name-org',
          name: 'uq_name_org',
          fields: [
            { name: 'name', direction: 'ASC' },
            { name: 'org_id', direction: 'ASC' },
          ],
          kind: 'unique_index',
        },
      ]);

      expect([...lookup.primaryFields]).toEqual(['id']);
      expect([...lookup.singleUniqueFields]).toEqual(['email']);
    });
  });

  describe('toCamelCase', () => {
    it('converts snake_case to camelCase', () => {
      expect(toCamelCase('user_name')).toBe('userName');
      expect(toCamelCase('create_at_time')).toBe('createAtTime');
    });

    it('returns unchanged for no underscores', () => {
      expect(toCamelCase('id')).toBe('id');
    });
  });

  describe('toPascalCase', () => {
    it('converts snake_case to PascalCase', () => {
      expect(toPascalCase('user_name')).toBe('UserName');
      expect(toPascalCase('order_item')).toBe('OrderItem');
    });
  });

  describe('escapePrismaDefault', () => {
    it('returns now() for current_timestamp', () => {
      expect(escapePrismaDefault('current_timestamp')).toBe('now()');
    });

    it('returns numeric as-is', () => {
      expect(escapePrismaDefault('0')).toBe('0');
      expect(escapePrismaDefault('3.14')).toBe('3.14');
    });

    it('returns boolean as-is', () => {
      expect(escapePrismaDefault('true')).toBe('true');
    });

    it('quotes string values', () => {
      expect(escapePrismaDefault('active')).toBe('"active"');
    });

    it('escapes quotes in strings', () => {
      expect(escapePrismaDefault('a"b')).toBe('"a\\"b"');
    });
  });

  describe('escapePythonString', () => {
    it('escapes single quotes', () => {
      expect(escapePythonString("it's")).toBe("it\\'s");
    });

    it('escapes double quotes', () => {
      expect(escapePythonString('say "hello"')).toBe('say \\"hello\\"');
    });
  });

  describe('escapeJavaString', () => {
    it('escapes double quotes', () => {
      expect(escapeJavaString('say "hello"')).toBe('say \\"hello\\"');
    });
  });
});

describe('PrismaGenerator', () => {
  const generator = new PrismaGenerator();

  it('generates composite unique index', () => {
    const indexes: IndexDefinition[] = [
      createIndex(),
      {
        id: 'unique-org-name',
        name: 'uk_org_name',
        fields: [
          { name: 'org_id', direction: 'ASC' },
          { name: 'name', direction: 'ASC' },
        ],
        kind: 'unique_index',
      },
    ];
    const fields = [
      createField(),
      createField({ name: 'org_id', type: 'int', defaultKind: 'none' }),
      createField({ name: 'name', type: 'varchar', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes,
    });
    expect(result).toContain('@@unique([orgId, name])');
  });

  it('generates foreign keys', () => {
    const fks: ForeignKeyDefinition[] = [
      {
        id: 'foreign-key-user',
        name: 'fk_user',
        fields: ['user_id'],
        refTable: 'users',
        refFields: ['id'],
      },
    ];
    const fields = [
      createField(),
      createField({ name: 'user_id', type: 'bigint', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'orders',
      tableComment: '',
      fields,
      indexes: [createIndex()],
      foreignKeys: fks,
      referencedModels: [{ tableName: 'users', fields: [{ name: 'id' }] }],
    });
    expect(result).toContain(
      'fkUser Users @relation(fields: [userId], references: [id], map: "fk_user")',
    );
  });

  it('generates uuid default', () => {
    const fields = [createField({ name: 'uuid', type: 'varchar', defaultKind: 'uuid' })];

    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
    });
    expect(result).toContain('@default(uuid())');
  });

  it('generates constant default', () => {
    const fields = [
      createField({
        name: 'status',
        type: 'varchar',
        defaultKind: 'constant',
        defaultValue: 'active',
      }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
    });
    expect(result).toContain('@default("active")');
  });
});

describe('TypeORMGenerator', () => {
  const generator = new TypeORMGenerator();

  it('generates with unique index', () => {
    const indexes: IndexDefinition[] = [
      createIndex(),
      {
        id: 'unique-email',
        name: 'uk_email',
        fields: [{ name: 'email', direction: 'ASC' }],
        kind: 'unique_index',
      },
    ];
    const fields = [
      createField(),
      createField({ name: 'email', type: 'varchar', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes,
    });
    expect(result).toContain('@Column({ type: "varchar", length: 255, unique: true })');
  });

  it('generates with default values', () => {
    const fields = [
      createField(),
      createField({
        name: 'status',
        type: 'varchar',
        defaultKind: 'constant',
        defaultValue: 'active',
      }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain("default: 'active'");
  });
});

describe('SQLAlchemyGenerator', () => {
  const generator = new SQLAlchemyGenerator();

  it('generates with foreign key', () => {
    const fks: ForeignKeyDefinition[] = [
      {
        id: 'foreign-key-user',
        name: 'fk_user',
        fields: ['user_id'],
        refTable: 'users',
        refFields: ['id'],
        onDelete: 'CASCADE',
      },
    ];
    const fields = [
      createField(),
      createField({ name: 'user_id', type: 'bigint', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'orders',
      tableComment: '',
      fields,
      indexes: [createIndex()],
      foreignKeys: fks,
    });
    expect(result).toContain("ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE')");
  });

  it('generates with index', () => {
    const indexes: IndexDefinition[] = [
      createIndex(),
      {
        id: 'index-name',
        name: 'idx_name',
        fields: [{ name: 'name', direction: 'ASC' }],
        kind: 'index',
      },
    ];
    const fields = [
      createField(),
      createField({ name: 'name', type: 'varchar', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes,
    });
    expect(result).toContain("Index('idx_name', 'name')");
  });

  it('handles varchar with args', () => {
    const fields = [createField({ name: 'name', type: 'varchar(100)', defaultKind: 'none' })];

    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
    });
    expect(result).toContain('name = Column(String(100), nullable=False)');
  });
});

describe('JPAGenerator', () => {
  const generator = new JPAGenerator();

  it('marks non-nullable column', () => {
    const fields = [createField({ name: 'name', type: 'varchar', defaultKind: 'none' })];

    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
    });
    expect(result).toContain('@Column(name = "name", nullable = false)');
  });

  it('marks nullable column without nullable=false', () => {
    const fields = [
      createField({ name: 'bio', type: 'text', defaultKind: 'none', nullable: true }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
    });
    expect(result).toContain('@Column(name = "bio")');
    expect(result).not.toContain('nullable = false');
  });
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
