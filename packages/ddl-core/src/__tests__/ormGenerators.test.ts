import { describe, it, expect } from 'vitest';
import { buildORM } from '../utils/ormGenerators';
import { ORMGeneratorFactory } from '../factories/ORMGeneratorFactory';
import type {
  NormalizedField,
  IndexDefinition,
  ForeignKeyDefinition,
} from '@ddlbuilder/shared-types';

const sampleFields: NormalizedField[] = [
  {
    name: 'id',
    type: 'bigint',
    comment: '主键ID',
    nullable: false,
    defaultKind: 'auto_increment',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'name',
    type: 'varchar(255)',
    comment: '名称',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'email',
    type: 'varchar(100)',
    comment: '邮箱',
    nullable: false,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'created_at',
    type: 'datetime',
    comment: '创建时间',
    nullable: false,
    defaultKind: 'current_timestamp',
    defaultValue: '',
    onUpdate: 'none',
  },
];

const sampleIndexes: IndexDefinition[] = [
  {
    id: '1',
    name: 'PRIMARY',
    fields: [{ name: 'id', direction: 'ASC' }],
    kind: 'primary',
  },
  {
    id: '2',
    name: 'idx_email',
    fields: [{ name: 'email', direction: 'ASC' }],
    kind: 'unique_index',
  },
  {
    id: '3',
    name: 'idx_name_email',
    fields: [
      { name: 'name', direction: 'ASC' },
      { name: 'email', direction: 'ASC' },
    ],
    kind: 'unique_index',
  },
];

const sampleForeignKeys: ForeignKeyDefinition[] = [
  {
    id: '1',
    name: 'fk_user_role',
    fields: ['id'],
    refTable: 'roles',
    refFields: ['id'],
  },
];

describe('buildORM', () => {
  it.each([
    ['prisma', '@default("")', '@default("now()")', '@default(dbgenerated("lower(\'X\')"))'],
    ['typeorm', "default: ''", "default: 'now()'", 'default: () => "lower(\'X\')"'],
    ['sqlalchemy', "default=''", "default='now()'", "server_default=text('lower(\\'X\\')')"],
  ] as const)(
    'preserves literal and expression defaults in %s',
    (target, empty, literal, expression) => {
      const field: NormalizedField = {
        name: 'label',
        type: 'text',
        comment: '',
        nullable: true,
        defaultKind: 'constant',
        defaultValue: '',
        onUpdate: 'none',
      };
      const model = buildORM(target, {
        dbType: 'mysql',
        tableName: 'defaults',
        tableComment: '',
        fields: [
          field,
          { ...field, name: 'literal', defaultValue: 'now()' },
          { ...field, name: 'computed', defaultKind: 'expression', defaultValue: "lower('X')" },
        ],
      });
      expect(model).toContain(empty);
      expect(model).toContain(literal);
      expect(model).toContain(expression);
    },
  );

  it('returns empty table message when table name is empty', () => {
    const result = buildORM('prisma', {
      dbType: 'mysql',
      tableName: '',
      tableComment: '',
      fields: [],
    });
    expect(result).toBe('-- 请填写表名');
  });

  it('returns empty fields message when fields are empty', () => {
    const result = buildORM('prisma', {
      dbType: 'mysql',
      tableName: 'users',
      tableComment: '',
      fields: [],
    });
    expect(result).toBe('-- 请补充字段信息');
  });
});

describe('ORMGeneratorFactory', () => {
  it('returns supported targets', () => {
    const targets = ORMGeneratorFactory.getSupportedTargets();
    expect(targets).toContain('prisma');
    expect(targets).toContain('typeorm');
    expect(targets).toContain('sqlalchemy');
    expect(targets).toContain('gorm');
    expect(targets).toContain('jpa');
    expect(targets).toHaveLength(5);
  });

  it('throws for unsupported target', () => {
    expect(() => ORMGeneratorFactory.create('invalid' as any)).toThrow('Unsupported ORM target');
  });

  it('creates every supported generator', () => {
    for (const target of ORMGeneratorFactory.getSupportedTargets()) {
      expect(ORMGeneratorFactory.create(target)).toBeDefined();
    }
  });
});

describe('PrismaGenerator', () => {
  it('generates Prisma model', () => {
    const result = buildORM('prisma', {
      dbType: 'mysql',
      tableName: 'user_info',
      tableComment: '用户信息表',
      fields: sampleFields,
      indexes: sampleIndexes,
      foreignKeys: sampleForeignKeys,
    });
    expect(result).toContain('model UserInfo {');
    expect(result).toContain('/// 用户信息表');
    expect(result).toContain('id');
    expect(result).toContain('BigInt');
    expect(result).toContain('@id');
    expect(result).toContain('@default(autoincrement())');
    expect(result).toContain('name');
    expect(result).toContain('String?');
    expect(result).toContain('email');
    expect(result).toContain('String');
    expect(result).toContain('createdAt');
    expect(result).toContain('DateTime');
    expect(result).toContain('@default(now())');
    expect(result).toContain('@@unique([name, email])');
    expect(result).toContain('@@unique([email])');
    expect(result).toContain(
      'fkUserRole Roles @relation(fields: [id], references: [id], map: "fk_user_role")',
    );
  });

  it('handles nullable primary key correctly', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: true,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];
    const indexes: IndexDefinition[] = [
      {
        id: '1',
        name: 'PRIMARY',
        fields: [{ name: 'id', direction: 'ASC' }],
        kind: 'primary',
      },
    ];
    const result = buildORM('prisma', {
      dbType: 'mysql',
      tableName: 'test',
      tableComment: '',
      fields,
      indexes,
    });
    expect(result).toContain('id');
    expect(result).toContain('Int');
    expect(result).not.toContain('Int?');
  });
});

describe('TypeORMGenerator', () => {
  it('generates TypeORM entity', () => {
    const result = buildORM('typeorm', {
      dbType: 'mysql',
      tableName: 'user_info',
      tableComment: '用户信息表',
      fields: sampleFields,
      indexes: sampleIndexes,
    });
    expect(result).toContain(
      "import { Entity, Column, Index, PrimaryGeneratedColumn, PrimaryColumn } from 'typeorm';",
    );
    expect(result).toContain("@Entity('user_info')");
    expect(result).toContain('export class UserInfo {');
    expect(result).toContain('@PrimaryGeneratedColumn({ type: "bigint" })');
    expect(result).toContain('id: string;');
    expect(result).toContain('name: string | null;');
    expect(result).toContain(
      '@Column({ type: "varchar", length: 100, unique: true, comment: \'邮箱\' })',
    );
    expect(result).toContain('email: string;');
  });
});

describe('SQLAlchemyGenerator', () => {
  it('generates SQLAlchemy model', () => {
    const result = buildORM('sqlalchemy', {
      dbType: 'mysql',
      tableName: 'user_info',
      tableComment: '用户信息表',
      fields: sampleFields,
      indexes: sampleIndexes,
    });
    expect(result).toContain('from sqlalchemy import Column');
    expect(result).toContain('Base = declarative_base()');
    expect(result).toContain('class UserInfo(Base):');
    expect(result).toContain("__tablename__ = 'user_info'");
    expect(result).toContain(
      "id = Column(BigInteger, primary_key=True, autoincrement=True, comment='主键ID')",
    );
    expect(result).toContain("name = Column(String(255), nullable=True, comment='名称')");
    expect(result).toContain("email = Column(String(100), nullable=False, comment='邮箱')");
    expect(result).toContain(
      "created_at = Column(DateTime, nullable=False, default=func.now(), comment='创建时间')",
    );
    expect(result).toContain("Index('idx_email', 'email', unique=True)");
    expect(result).toContain("Index('idx_name_email', 'name', 'email', unique=True)");
  });
});

describe('GORMGenerator', () => {
  it('generates GORM struct', () => {
    const result = buildORM('gorm', {
      dbType: 'mysql',
      tableName: 'user_info',
      tableComment: '用户信息表',
      fields: sampleFields,
      indexes: sampleIndexes,
    });
    expect(result).toContain('package models');
    expect(result).toContain('import "time"');
    expect(result).toContain('type UserInfo struct {');
    expect(result).toContain('gorm:"column:id;primaryKey;autoIncrement;comment:主键ID"');
    expect(result).toContain('Id');
    expect(result).toContain('int64');
    expect(result).toContain('gorm:"column:email;uniqueIndex;comment:邮箱"');
    expect(result).toContain('Name');
    expect(result).toContain('*string');
    expect(result).toContain('func (UserInfo) TableName() string {');
    expect(result).toContain('return "user_info"');
  });

  it('does not import time when not needed', () => {
    const fields: NormalizedField[] = [
      {
        name: 'id',
        type: 'int',
        comment: '',
        nullable: false,
        defaultKind: 'auto_increment',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];
    const result = buildORM('gorm', {
      dbType: 'mysql',
      tableName: 'test',
      tableComment: '',
      fields,
    });
    expect(result).not.toContain('import "time"');
  });
});

describe('JPAGenerator', () => {
  it('generates JPA entity', () => {
    const result = buildORM('jpa', {
      dbType: 'mysql',
      tableName: 'user_info',
      tableComment: '用户信息表',
      fields: sampleFields,
      indexes: sampleIndexes,
    });
    expect(result).toContain('import jakarta.persistence.*;');
    expect(result).toContain('import java.util.Date;');
    expect(result).toContain('@Entity');
    expect(result).toContain('@Table(name = "user_info")');
    expect(result).toContain('public class UserInfo {');
    expect(result).toContain('@Id');
    expect(result).toContain('@GeneratedValue(strategy = GenerationType.IDENTITY)');
    expect(result).toContain('private Long id;');
    expect(result).toContain('private String name;');
    expect(result).toContain('public Long getId()');
    expect(result).toContain('public void setId(Long id)');
  });

  it('imports BigDecimal when needed', () => {
    const fields: NormalizedField[] = [
      {
        name: 'amount',
        type: 'decimal(10,2)',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];
    const result = buildORM('jpa', {
      dbType: 'mysql',
      tableName: 'test',
      tableComment: '',
      fields,
    });
    expect(result).toContain('import java.math.BigDecimal;');
    expect(result).toContain('private BigDecimal amount;');
  });

  it('imports UUID when needed', () => {
    const fields: NormalizedField[] = [
      {
        name: 'uuid_col',
        type: 'uuid',
        comment: '',
        nullable: false,
        defaultKind: 'none',
        defaultValue: '',
        onUpdate: 'none',
      },
    ];
    const result = buildORM('jpa', {
      dbType: 'mysql',
      tableName: 'test',
      tableComment: '',
      fields,
    });
    expect(result).toContain('import java.util.UUID;');
    expect(result).toContain('private UUID uuidCol;');
  });
});

describe('generated string literals', () => {
  it.each(['typeorm', 'sqlalchemy'] as const)(
    'escapes newlines and backslashes in %s',
    (target) => {
      const value = 'line' + String.fromCharCode(10) + 'C:' + String.fromCharCode(92);
      const result = buildORM(target, {
        dbType: 'mysql',
        tableName: 'items',
        tableComment: '',
        fields: [
          { ...sampleFields[1], comment: value, defaultKind: 'constant', defaultValue: value },
        ],
        indexes: [],
      });
      expect(result).not.toContain(value);
      expect(result).toContain(String.fromCharCode(92) + 'n');
    },
  );
  it('keeps Go comments out of tags when they contain tag delimiters', () => {
    const comment = 'a;b "q"';
    const result = buildORM('gorm', {
      dbType: 'mysql',
      tableName: 'items',
      tableComment: '',
      fields: [{ ...sampleFields[1], comment }],
      indexes: [],
    });
    expect(result).toContain('// ' + comment);
    expect(result).not.toContain('comment:' + comment);
  });
  it('preserves database DateTime defaults for Prisma', () => {
    const result = buildORM('prisma', {
      dbType: 'mysql',
      tableName: 'items',
      tableComment: '',
      fields: [
        { ...sampleFields[3], defaultKind: 'constant', defaultValue: '2024-01-01 00:00:00' },
      ],
      indexes: [],
    });
    expect(result).toContain('dbgenerated(');
  });
});
