import { describe, it, expect } from 'vitest';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory.js';
import { ProfiledDDLStrategy } from '../strategies/ProfiledDDLStrategy.js';
import { HiveStrategy } from '../strategies/HiveStrategy.js';
import { DATABASE_TYPES, type DatabaseType } from '@ddlbuilder/shared-types';

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
    expect(supported).toEqual(DATABASE_TYPES);
  });

  it('应该为 Hive 使用独立实现，其余方言走通用生成器', () => {
    expect(DDLStrategyFactory.create('hive')).toBeInstanceOf(HiveStrategy);
    expect(DDLStrategyFactory.create('mysql')).toBeInstanceOf(ProfiledDDLStrategy);
  });
});
