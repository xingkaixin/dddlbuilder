import { describe, it, expect } from 'vitest';
import { AbstractDDLStrategy } from '../../strategies/AbstractDDLStrategy.js';
import type { NormalizedField, IndexDefinition, DatabaseType } from '@ddlbuilder/shared-types';
import { TypeMapper } from '../../utils/TypeMapper.js';

class TestStrategy extends AbstractDDLStrategy {
  constructor(private readonly db: DatabaseType = 'mysql') {
    super();
  }

  getDatabaseType(): DatabaseType {
    return this.db;
  }

  generateTableDDL(): string {
    return 'DUMMY DDL';
  }

  public exposeFormatTableName(name: string) {
    return this.formatTableName(name);
  }

  public exposeFormatFieldName(name: string) {
    return this.formatFieldName(name);
  }

  public exposeGeneratePrimaryKeyDDL(table: string, index: IndexDefinition) {
    return this.generatePrimaryKeyDDL(table, index);
  }

  public exposeFormatIndexFieldList(index: IndexDefinition) {
    return this.formatIndexFieldList(index);
  }

  public exposeGenerateStandardIndexDDL(table: string, index: IndexDefinition) {
    return this.generateStandardIndexDDL(table, index);
  }

  public exposeCreateTypeMapper() {
    return this.createTypeMapper();
  }

  public exposeGenerateColumnCommentsDDL(table: string, fields: NormalizedField[]) {
    return this.generateColumnCommentsDDL(table, fields);
  }
}

const sampleFields: NormalizedField[] = [
  {
    name: 'id',
    type: 'int',
    comment: '主键',
    nullable: false,
    defaultKind: 'auto_increment',
    defaultValue: '',
    onUpdate: 'none',
  },
  {
    name: 'note',
    type: 'varchar(20)',
    comment: '',
    nullable: true,
    defaultKind: 'none',
    defaultValue: '',
    onUpdate: 'none',
  },
];

const primaryIndex: IndexDefinition = {
  id: 'pk',
  name: 'pk_users',

  kind: 'primary',
  fields: [
    { name: 'id', direction: 'ASC' },
    { name: 'created_at', direction: 'DESC' },
  ],
};

const normalIndex: IndexDefinition = {
  id: 'idx_name',
  name: 'idx_users_name',

  kind: 'index',
  fields: [{ name: 'name', direction: 'ASC' }],
};

describe('AbstractDDLStrategy', () => {
  it.each([
    ['postgresql', 'Users', '"Users"'],
    ['postgresql', 'order', '"order"'],
    ['postgresql', 'odd"name', '"odd""name"'],
    ['mysql', 'odd`name', '`odd``name`'],
    ['sqlserver', 'odd]name', '[odd]]name]'],
    ['oracle', 'two words', '"two words"'],
  ] as const)('quotes %s identifiers without changing their value', (dbType, name, expected) => {
    const strategy = new TestStrategy(dbType);
    expect(strategy.formatFieldName(name)).toBe(expected);
  });

  it('keeps quoted qualified-name components intact', () => {
    const strategy = new TestStrategy('postgresql');
    expect(strategy.formatTableName('"Audit.Log"."User""Data"')).toBe('"Audit.Log"."User""Data"');
  });

  it('应该格式化带 schema 的表名', () => {
    const strategy = new TestStrategy();
    expect(strategy.exposeFormatTableName('public.users')).toBe('public.users');
  });

  it('应该在表名为空时返回裁剪结果', () => {
    const strategy = new TestStrategy();
    expect(strategy.exposeFormatTableName('   ')).toBe('');
  });

  it('应该原样返回字段名', () => {
    const strategy = new TestStrategy();
    expect(strategy.exposeFormatFieldName('user_id')).toBe('user_id');
  });

  it('应该生成主键 DDL', () => {
    const strategy = new TestStrategy();
    const ddl = strategy.exposeGeneratePrimaryKeyDDL('users', primaryIndex);
    expect(ddl).toBe('ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id, created_at);');
  });

  it('应该保留用户配置的主键约束名', () => {
    const strategy = new TestStrategy();
    const ddl = strategy.exposeGeneratePrimaryKeyDDL('users', {
      ...primaryIndex,
      name: 'users_identity_key',
    });

    expect(ddl).toBe(
      'ALTER TABLE users ADD CONSTRAINT users_identity_key PRIMARY KEY (id, created_at);',
    );
  });

  it('应该按数据库限制截断主键约束名', () => {
    const strategy = new TestStrategy('oracle');
    const ddl = strategy.exposeGeneratePrimaryKeyDDL('users', {
      ...primaryIndex,
      name: `pk_${'very_long_name_'.repeat(4)}`,
    });
    const constraintName = ddl.match(/ADD CONSTRAINT (\S+) PRIMARY KEY/)?.[1];

    expect(constraintName).toHaveLength(30);
    expect(constraintName).toMatch(/_[a-z0-9]{4}$/);
  });

  it('应该格式化索引字段列表', () => {
    const strategy = new TestStrategy();
    expect(strategy.exposeFormatIndexFieldList(normalIndex)).toBe('name ASC');
  });

  it('应该为普通索引生成标准 DDL', () => {
    const strategy = new TestStrategy();
    const ddl = strategy.exposeGenerateStandardIndexDDL('users', normalIndex);
    expect(ddl).toBe('CREATE INDEX idx_users_name ON users (name ASC);');
  });

  it('generateIndexDDL 应该识别主键并复用公共实现', () => {
    const strategy = new TestStrategy();
    const ddl = strategy.generateIndexDDL('users', primaryIndex);
    expect(ddl).toBe('ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id, created_at);');
  });

  it('应该创建匹配数据库类型的 TypeMapper', () => {
    const strategy = new TestStrategy('mysql');
    const mapper = strategy.exposeCreateTypeMapper();
    expect(mapper).toBeInstanceOf(TypeMapper);
    expect(
      mapper.mapType({
        baseType: 'int',
        args: [],
        unsigned: false,
        raw: 'int',
      }),
    ).toBe('INT');
  });

  it('生成列注释 DDL 时应忽略空注释', () => {
    const strategy = new TestStrategy('postgresql');
    const statements = strategy.exposeGenerateColumnCommentsDDL('public.users', sampleFields);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toBe("COMMENT ON COLUMN public.users.id IS '主键';");
  });
});
