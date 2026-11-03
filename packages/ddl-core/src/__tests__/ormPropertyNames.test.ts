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

  it.each([['typeorm', "referencedColumnName: 'userId_2'"]] as const)(
    'uses complete target metadata for %s external references',
    (target, expected) => {
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
    },
  );

  it.each(['prisma'] as const)(
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
});
