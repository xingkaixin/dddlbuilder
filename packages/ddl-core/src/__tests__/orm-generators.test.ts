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
  isPrimaryKeyField,
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
  name: 'pk_id',
  fields: [{ name: 'id', direction: 'ASC' }],
  unique: false,
  isPrimary: true,
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
          isPrimary: true,
        }),
      ];
      expect(getPrimaryKeyFieldNames(indexes)).toEqual(['id', 'org_id']);
    });
  });

  describe('isPrimaryKeyField', () => {
    it('returns true for PK field', () => {
      expect(isPrimaryKeyField('id', [createIndex()])).toBe(true);
    });

    it('returns false for non-PK field', () => {
      expect(isPrimaryKeyField('name', [createIndex()])).toBe(false);
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
          unique: true,
        },
        {
          id: 'unique-name-org',
          name: 'uq_name_org',
          fields: [
            { name: 'name', direction: 'ASC' },
            { name: 'org_id', direction: 'ASC' },
          ],
          unique: true,
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

  it('returns prompt for empty table name', () => {
    expect(
      generator.generateModel({
        dbType: 'mysql',
        tableName: '',
        tableComment: '',
        fields: [createField()],
      }),
    ).toBe('-- 请填写表名');
  });

  it('returns prompt for no fields', () => {
    expect(
      generator.generateModel({
        dbType: 'mysql',
        tableName: 'users',
        tableComment: '',
        fields: [],
      }),
    ).toBe('-- 请补充字段信息');
  });

  it('generates basic model', () => {
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '用户表',
      fields: [createField()],
      indexes: [createIndex()],
    });
    expect(result).toContain('model Users {');
    expect(result).toContain('/// 用户表');
    expect(result).toContain('id');
    expect(result).toContain('@id');
    expect(result).toContain('@default(autoincrement())');
  });

  it('generates model with multiple fields', () => {
    const fields = [
      createField(),
      createField({ name: 'name', type: 'varchar', defaultKind: 'none', nullable: false }),
      createField({ name: 'email', type: 'varchar', defaultKind: 'none', nullable: true }),
      createField({
        name: 'created_at',
        type: 'timestamp',
        defaultKind: 'current_timestamp',
        nullable: false,
      }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('name');
    expect(result).toContain('email');
    expect(result).toContain('String?'); // nullable
    expect(result).toContain('@default(now())');
  });

  it('generates composite unique index', () => {
    const indexes: IndexDefinition[] = [
      createIndex(),
      {
        name: 'uk_org_name',
        fields: [
          { name: 'org_id', direction: 'ASC' },
          { name: 'name', direction: 'ASC' },
        ],
        unique: true,
        isPrimary: false,
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
      { name: 'fk_user', fields: ['user_id'], refTable: 'users', refFields: ['id'] },
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

  it('returns prompt for empty table name', () => {
    expect(
      generator.generateModel({
        dbType: 'mysql',
        tableName: '',
        tableComment: '',
        fields: [createField()],
      }),
    ).toBe('-- 请填写表名');
  });

  it('generates basic entity', () => {
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '用户表',
      fields: [createField()],
      indexes: [createIndex()],
    });
    expect(result).toContain(
      "import { Entity, Column, Index, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';",
    );
    expect(result).toContain("@Entity('users')");
    expect(result).toContain('export class Users {');
    expect(result).toContain('@PrimaryGeneratedColumn()');
    expect(result).toContain('id: number;');
  });

  it('generates with nullable field', () => {
    const fields = [
      createField(),
      createField({ name: 'deleted_at', type: 'timestamp', defaultKind: 'none', nullable: true }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('deletedAt: Date | null;');
  });

  it('generates with unique index', () => {
    const indexes: IndexDefinition[] = [
      createIndex(),
      {
        name: 'uk_email',
        fields: [{ name: 'email', direction: 'ASC' }],
        unique: true,
        isPrimary: false,
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
    expect(result).toContain('@Column({ unique: true })');
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

  it('returns prompt for empty table name', () => {
    expect(
      generator.generateModel({
        dbType: 'mysql',
        tableName: '',
        tableComment: '',
        fields: [createField()],
      }),
    ).toBe('# 请填写表名');
  });

  it('generates basic model', () => {
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '用户表',
      fields: [createField()],
      indexes: [createIndex()],
    });
    expect(result).toContain('from sqlalchemy import Column');
    expect(result).toContain('class Users(Base):');
    expect(result).toContain("__tablename__ = 'users'");
    expect(result).toContain('# 用户表');
    expect(result).toContain('id = Column(BigInteger, primary_key=True, autoincrement=True)');
  });

  it('generates with nullable field', () => {
    const fields = [
      createField(),
      createField({ name: 'bio', type: 'text', defaultKind: 'none', nullable: true }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('bio = Column(Text, nullable=True)');
  });

  it('generates with foreign key', () => {
    const fks: ForeignKeyDefinition[] = [
      {
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
        name: 'idx_name',
        fields: [{ name: 'name', direction: 'ASC' }],
        unique: false,
        isPrimary: false,
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

describe('GORMGenerator', () => {
  const generator = new GORMGenerator();

  it('returns prompt for empty table name', () => {
    expect(
      generator.generateModel({
        dbType: 'mysql',
        tableName: '',
        tableComment: '',
        fields: [createField()],
      }),
    ).toBe('// 请填写表名');
  });

  it('generates basic struct', () => {
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '用户表',
      fields: [createField()],
      indexes: [createIndex()],
    });
    expect(result).toContain('package models');
    expect(result).toContain('type Users struct {');
    expect(result).toContain('Id');
    expect(result).toContain('gorm:"column:id;primaryKey;autoIncrement"');
    expect(result).toContain('func (Users) TableName() string {');
    expect(result).toContain('return "users"');
  });

  it('imports time when needed', () => {
    const fields = [
      createField(),
      createField({ name: 'created_at', type: 'timestamp', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('import "time"');
    expect(result).toContain('CreatedAt');
    expect(result).toContain('time.Time');
  });

  it('generates nullable field with pointer', () => {
    const fields = [
      createField(),
      createField({ name: 'deleted_at', type: 'timestamp', defaultKind: 'none', nullable: true }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('*time.Time');
  });

  it('generates unique index tag', () => {
    const indexes: IndexDefinition[] = [
      createIndex(),
      {
        name: 'uk_email',
        fields: [{ name: 'email', direction: 'ASC' }],
        unique: true,
        isPrimary: false,
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
    expect(result).toContain('gorm:"column:email;uniqueIndex"');
  });

  it('includes comment in tag', () => {
    const fields = [
      createField({ name: 'name', type: 'varchar', defaultKind: 'none', comment: '用户名' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
    });
    expect(result).toContain('gorm:"column:name;comment:用户名"');
  });
});

describe('JPAGenerator', () => {
  const generator = new JPAGenerator();

  it('returns prompt for empty table name', () => {
    expect(
      generator.generateModel({
        dbType: 'mysql',
        tableName: '',
        tableComment: '',
        fields: [createField()],
      }),
    ).toBe('// 请填写表名');
  });

  it('generates basic entity', () => {
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '用户表',
      fields: [createField()],
      indexes: [createIndex()],
    });
    expect(result).toContain('import jakarta.persistence.*;');
    expect(result).toContain('@Entity');
    expect(result).toContain('@Table(name = "users")');
    expect(result).toContain('public class Users {');
    expect(result).toContain('@Id');
    expect(result).toContain('@GeneratedValue(strategy = GenerationType.IDENTITY)');
    expect(result).toContain('private Long id;');
  });

  it('imports java.util.Date for date types', () => {
    const fields = [
      createField(),
      createField({ name: 'created_at', type: 'timestamp', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('import java.util.Date;');
  });

  it('imports BigDecimal for decimal types', () => {
    const fields = [
      createField(),
      createField({ name: 'price', type: 'decimal', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('import java.math.BigDecimal;');
  });

  it('imports UUID for uuid type', () => {
    const fields = [
      createField(),
      createField({ name: 'uuid', type: 'uuid', defaultKind: 'none' }),
    ];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
      indexes: [createIndex()],
    });
    expect(result).toContain('import java.util.UUID;');
  });

  it('generates getters and setters', () => {
    const fields = [createField({ name: 'name', type: 'varchar', defaultKind: 'none' })];
    const result = generator.generateModel({
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields,
    });
    expect(result).toContain('public String getName()');
    expect(result).toContain('public void setName(String name)');
  });

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

  it('emits usable relationship metadata for every target', () => {
    const outputs = {
      prisma: new PrismaGenerator().generateModel({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys,
      }),
      typeorm: new TypeORMGenerator().generateModel({
        dbType: 'mysql',
        tableName: 'orders',
        tableComment: '',
        fields,
        foreignKeys,
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
