import { describe, expect, it } from 'vitest';
import type { NormalizedField } from '@ddlbuilder/shared-types';
import type { ORMModelInput } from '../interfaces/ORMGenerator';
import { buildORM } from '../utils/ormGenerators';

const field = (name: string): NormalizedField => ({
  name,
  type: 'int',
  comment: '',
  nullable: false,
  defaultKind: 'none',
  defaultValue: '',
  onUpdate: 'none',
});

const input = {
  dbType: 'postgresql',
  tableName: 'members',
  tableComment: '',
  fields: ['user_id', 'userId', 'userId_2', 'user-name', '1st', 'constructor'].map(field),
  indexes: [
    {
      id: 'pk',
      name: 'PRIMARY',
      kind: 'primary',
      fields: [{ name: 'userId', direction: 'ASC' }],
    },
    {
      id: 'index',
      name: 'idx_members',
      kind: 'index',
      fields: ['user_id', 'userId', 'userId_2'].map((name) => ({ name, direction: 'ASC' })),
    },
  ],
  foreignKeys: [
    {
      id: 'self',
      name: 'user_id',
      fields: ['user_id'],
      refTable: 'members',
      refFields: ['userId'],
    },
  ],
} satisfies ORMModelInput;

describe('ORM property identifiers', () => {
  it('keeps TypeORM columns, indexes and self references on the same unique names', () => {
    const model = buildORM('typeorm', input);
    expect(model).toContain('userId: number;');
    expect(model).toContain('userId_2: number;');
    expect(model).toContain('userId_2_2: number;');
    expect(model).toContain('name: "userId"');
    expect(model).toContain("@Index(['userId', 'userId_2', 'userId_2_2'])");
    expect(model).toContain("referencedColumnName: 'userId_2'");
    expect(model).toContain('userId_3: Members;');
    expect(model).toContain('userName: number;');
    expect(model).toContain('field_1st: number;');
    expect(model).toContain('constructor_: number;');
  });

  it('keeps Prisma scalar and relation fields unique without losing database names', () => {
    const model = buildORM('prisma', input);
    expect(model).toMatch(/userId_2\s+Int\s+@id @map\("userId"\)/);
    expect(model).toMatch(/userId_2_2\s+Int\s+@map\("userId_2"\)/);
    expect(model).toContain('@@index([userId, userId_2, userId_2_2])');
    expect(model).toContain('userId_3 Members @relation(fields: [userId], references: [userId_2]');
    expect(model).toMatch(/userName\s+Int\s+@map\("user-name"\)/);
    expect(model).toMatch(/field_1st\s+Int\s+@map\("1st"\)/);
  });

  it.each([
    ['prisma', 'references: [userId_2]'],
    ['typeorm', "referencedColumnName: 'userId_2'"],
    ['gorm', 'references:UserId_2'],
  ] as const)('uses complete target metadata for %s external references', (target, expected) => {
    const model = buildORM(target, {
      ...input,
      foreignKeys: [
        {
          ...input.foreignKeys[0],
          name: 'other_user',
          fields: ['userId'],
          refTable: 'users',
          refFields: ['userId'],
        },
      ],
      referencedModels: [
        {
          tableName: 'users',
          fields: ['user_id', 'userId'].map(field),
        },
      ],
    });
    expect(model).toContain(expected);
  });

  it.each(['prisma', 'typeorm', 'gorm'] as const)(
    'requires complete target metadata for %s external references',
    (target) => {
      const model = buildORM(target, {
        ...input,
        foreignKeys: [{ ...input.foreignKeys[0], refTable: 'users' }],
      });
      expect(model).toContain('Manual mapping required');
      expect(model).toContain('referencedModels');
      expect(model.split('\n')).toHaveLength(1);
    },
  );

  it('uses safe Python attributes while keeping database names in constraints', () => {
    const model = buildORM('sqlalchemy', {
      ...input,
      fields: [
        'id',
        'class',
        'class_',
        'user-name',
        'user_name',
        'metadata',
        'Column',
        '1st',
        '__tablename__',
        '__doc__',
        '_sa_instance_state',
      ].map(field),
      indexes: [
        { ...input.indexes[0], fields: [{ name: 'id', direction: 'ASC' }] },
        { ...input.indexes[1], fields: [{ name: 'class', direction: 'ASC' }] },
      ],
      foreignKeys: [{ ...input.foreignKeys[0], fields: ['class'], refFields: ['id'] }],
    });
    expect(model).toContain("class_ = Column('class', Integer");
    expect(model).toContain("class__2 = Column('class_', Integer");
    expect(model).toContain("user_name = Column('user-name', Integer");
    expect(model).toContain("user_name_2 = Column('user_name', Integer");
    expect(model).toContain("metadata_ = Column('metadata', Integer");
    expect(model).toContain("Column_ = Column('Column', Integer");
    expect(model).toContain("field_1st = Column('1st', Integer");
    expect(model).toContain("field___tablename__ = Column('__tablename__', Integer");
    expect(model).toContain("field___doc__ = Column('__doc__', Integer");
    expect(model).toContain("field__sa_instance_state = Column('_sa_instance_state', Integer");
    expect(model).toContain("Index('idx_members', 'class')");
    expect(model).toContain("ForeignKeyConstraint(['class'], ['members.id'])");
  });

  it('keeps Java accessors unique and avoids Object.getClass', () => {
    const model = buildORM('jpa', {
      ...input,
      fields: ['id', 'class', 'Class', 'user_id', 'userId', 'UserId'].map(field),
      indexes: [],
      foreignKeys: [],
    });
    expect(model).toContain('private Integer class_;');
    expect(model).toContain('private Integer Class__2;');
    expect(model).toContain('public Integer getClass_()');
    expect(model).toContain('public Integer getClass__2()');
    expect(model).not.toContain('getClass()');
    expect(model).toContain('public Integer getUserId_2()');
    expect(model).toContain('public Integer getUserId_3()');
  });

  it('keeps Go fields exported and reserves its TableName method', () => {
    const model = buildORM('gorm', {
      ...input,
      fields: [...input.fields, field('table_name')],
    });
    expect(model).toMatch(/UserId\s+int\s+`gorm:"column:user_id"/);
    expect(model).toMatch(/UserId_2\s+int\s+`gorm:"column:userId;primaryKey"/);
    expect(model).toMatch(/UserId_3\s+Members\s+`gorm:"foreignKey:UserId;references:UserId_2"/);
    expect(model).toMatch(/TableName_\s+int\s+`gorm:"column:table_name"/);
    expect(model).toMatch(/Field_1st\s+int/);
  });
});
