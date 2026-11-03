import { describe, it, expect } from 'vitest';
import { AbstractDDLStrategy } from '../../strategies/AbstractDDLStrategy.js';
import type { IndexDefinition, DatabaseType } from '@ddlbuilder/shared-types';

class TestStrategy extends AbstractDDLStrategy {
  private readonly db: DatabaseType;

  constructor(db: DatabaseType = 'mysql') {
    super();
    this.db = db;
  }

  getDatabaseType(): DatabaseType {
    return this.db;
  }

  generateTableDDL(): string {
    return 'DUMMY DDL';
  }

  public exposeGeneratePrimaryKeyDDL(table: string, index: IndexDefinition) {
    return this.generatePrimaryKeyDDL(table, index);
  }
}

const primaryIndex: IndexDefinition = {
  id: 'pk',
  name: 'pk_users',

  kind: 'primary',
  fields: [
    { name: 'id', direction: 'ASC' },
    { name: 'created_at', direction: 'DESC' },
  ],
};

describe('AbstractDDLStrategy', () => {
  it.each([
    ['mysql', 'odd`name', '`odd``name`'],
    ['sqlserver', 'odd]name', '[odd]]name]'],
  ] as const)('quotes %s identifiers without changing their value', (dbType, name, expected) => {
    const strategy = new TestStrategy(dbType);
    expect(strategy.formatFieldName(name)).toBe(expected);
  });

  it('keeps quoted qualified-name components intact', () => {
    const strategy = new TestStrategy('postgresql');
    expect(strategy.formatTableName('"Audit.Log"."User""Data"')).toBe('"Audit.Log"."User""Data"');
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
});
