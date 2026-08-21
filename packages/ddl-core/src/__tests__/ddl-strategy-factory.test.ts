import { describe, it, expect } from 'vitest';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory.js';
import { MySqlStrategy } from '../strategies/MySqlStrategy.js';
import type { DatabaseType } from '@ddlbuilder/shared-types';

describe('DDLStrategyFactory', () => {
  it('应该根据数据库类型返回对应策略', () => {
    const result = DDLStrategyFactory.create('postgresql');
    expect(result.getDatabaseType()).toBe('postgresql');
  });

  it('应该支持 PostgreSQL(Citus) 策略', () => {
    const result = DDLStrategyFactory.create('postgresql-citus');
    expect(result.getDatabaseType()).toBe('postgresql-citus');
  });

  it('不支持的数据库类型应抛出异常', () => {
    expect(() => DDLStrategyFactory.create('invalid' as DatabaseType)).toThrowError(
      'Unsupported database type: invalid',
    );
  });

  it('应该返回支持的数据库类型列表', () => {
    const supported = DDLStrategyFactory.getSupportedDatabaseTypes();
    expect(supported.sort()).toEqual([
      'dm',
      'gaussdb',
      'gbase',
      'hive',
      'kingbase',
      'mariadb',
      'mysql',
      'oceanbase',
      'oceanbase-oracle',
      'oracle',
      'polardb',
      'postgresql',
      'postgresql-citus',
      'sqlserver',
      'tidb',
    ]);
  });

  it('应该返回与数据库类型匹配的策略实现', () => {
    expect(DDLStrategyFactory.create('mysql')).toBeInstanceOf(MySqlStrategy);
  });
});
