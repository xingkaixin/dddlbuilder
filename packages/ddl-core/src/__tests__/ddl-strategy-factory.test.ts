import { describe, it, expect } from 'vitest';
import { DDLStrategyFactory } from '../factories/DDLStrategyFactory.js';
import { DATABASE_TYPES } from '@ddlbuilder/shared-types';

describe('DDLStrategyFactory', () => {
  it('应该为每种支持的数据库创建对应策略', () => {
    for (const dbType of DATABASE_TYPES) {
      expect(DDLStrategyFactory.create(dbType).getDatabaseType()).toBe(dbType);
    }
  });
});
