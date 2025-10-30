import { describe, it, expect, afterEach } from 'vitest'
import { DDLStrategyFactory } from '@/factories/DDLStrategyFactory'
import { MySqlStrategy } from '@/strategies/MySqlStrategy'
import type { DDLStrategy } from '@/interfaces/DDLStrategy'
import type { DatabaseType } from '@/types'

class StubStrategy extends MySqlStrategy {}

const originalMysqlStrategy = DDLStrategyFactory.create('mysql')

afterEach(() => {
  DDLStrategyFactory.registerStrategy('mysql', originalMysqlStrategy)
})

describe('DDLStrategyFactory', () => {
  it('应该根据数据库类型返回对应策略', () => {
    const result = DDLStrategyFactory.create('postgresql')
    expect(result.getDatabaseType()).toBe('postgresql')
  })

  it('不支持的数据库类型应抛出异常', () => {
    expect(() => DDLStrategyFactory.create('invalid' as DatabaseType)).toThrowError()
  })

  it('应该返回支持的数据库类型列表', () => {
    const supported = DDLStrategyFactory.getSupportedDatabaseTypes()
    expect(supported.sort()).toEqual(['mysql', 'oracle', 'postgresql', 'sqlserver'])
  })

  it('registerStrategy 应允许覆盖已有策略', () => {
    const stub: DDLStrategy = new StubStrategy()
    DDLStrategyFactory.registerStrategy('mysql', stub)

    const result = DDLStrategyFactory.create('mysql')
    expect(result).toBe(stub)
  })
})
