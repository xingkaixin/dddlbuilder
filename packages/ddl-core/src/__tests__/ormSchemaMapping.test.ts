import { describe, expect, it } from 'vitest';
import type { ORMModelInput, ORMTarget } from '../interfaces/ORMGenerator';
import { buildORM } from '../utils/ormGenerators';

const input: ORMModelInput = {
  dbType: 'postgresql',
  schemaName: ' app ',
  tableName: ' user_profile ',
  tableComment: '',
  fields: [
    {
      name: 'user_id',
      type: 'int',
      comment: '',
      nullable: false,
      defaultKind: 'none',
      defaultValue: '',
      onUpdate: 'none',
    },
  ],
  indexes: [
    {
      id: 'pk',
      name: 'pk_user_profile',
      fields: [{ name: 'user_id', direction: 'ASC' }],
      kind: 'primary',
    },
  ],
};

describe('ORM schema mapping', () => {
  it.each([
    { target: 'prisma', declaration: 'model UserProfile {', mapping: '@@schema("app")' },
    {
      target: 'typeorm',
      declaration: 'export class UserProfile {',
      mapping: '@Entity({ name: "user_profile", schema: "app" })',
    },
    { target: 'sqlalchemy', declaration: 'class UserProfile(Base):', mapping: '{"schema": "app"}' },
    {
      target: 'gorm',
      declaration: 'type UserProfile struct {',
      mapping: 'return "app.user_profile"',
    },
    {
      target: 'jpa',
      declaration: 'public class UserProfile {',
      mapping: '@Table(name = "user_profile", schema = "app")',
    },
  ] satisfies { target: ORMTarget; declaration: string; mapping: string }[])(
    'keeps the schema out of $target type names',
    ({ target, declaration, mapping }) => {
      const model = buildORM(target, input);
      expect(model).toContain(declaration);
      expect(model).toContain(mapping);
    },
  );

  it.each(['postgresql', 'postgresql-citus', 'sqlserver'] as const)(
    'preserves Prisma table mapping separately from the %s schema',
    (dbType) => {
      const model = buildORM('prisma', { ...input, dbType });
      expect(model).toContain('@@map("user_profile")');
      expect(model).toContain('@@schema("app")');
      expect(model).toContain('Add "app" to datasource.schemas');
      expect(model).not.toContain('@@map("app.user_profile")');
    },
  );

  it.each(['mysql', 'mariadb', 'tidb'] as const)(
    'uses database/catalog settings for %s instead of schema annotations',
    (dbType) => {
      const modelInput = { ...input, dbType };
      expect(buildORM('typeorm', modelInput)).toContain('database: "app"');
      expect(buildORM('jpa', modelInput)).toContain('catalog = "app"');
      const prisma = buildORM('prisma', modelInput);
      expect(prisma).not.toContain('@@schema(');
      expect(prisma).toContain('Select database "app"');
    },
  );

  it('combines the SQLAlchemy schema with existing indexes and foreign keys', () => {
    const model = buildORM('sqlalchemy', {
      ...input,
      indexes: [
        {
          id: 'idx',
          name: 'idx_user',
          fields: [{ name: 'user_id', direction: 'ASC' }],
          kind: 'index',
        },
      ],
      foreignKeys: [
        {
          id: 'fk',
          name: 'fk_user',
          fields: ['user_id'],
          refSchema: 'auth',
          refTable: 'users',
          refFields: ['id'],
        },
      ],
    });
    expect(model).toContain("__tablename__ = 'user_profile'");
    expect(model).toContain("Index('idx_user', 'user_id')");
    expect(model).toContain("ForeignKeyConstraint(['user_id'], ['auth.users.id'])");
    expect(model).toContain('{"schema": "app"}');
    expect(model.match(/__table_args__/g)).toHaveLength(1);
  });

  it('does not invent a namespace when the schema is empty', () => {
    const modelInput = { ...input, schemaName: ' ' };
    expect(buildORM('prisma', modelInput)).not.toContain('@@schema(');
    expect(buildORM('typeorm', modelInput)).toContain("@Entity('user_profile')");
    expect(buildORM('sqlalchemy', modelInput)).not.toContain('__table_args__');
    expect(buildORM('gorm', modelInput)).toContain('return "user_profile"');
    expect(buildORM('jpa', modelInput)).toContain('@Table(name = "user_profile")');
  });
});
