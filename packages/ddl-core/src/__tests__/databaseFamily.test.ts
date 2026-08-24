import { describe, expect, it } from 'vitest';
import type { DatabaseType } from '@ddlbuilder/shared-types';
import {
  getDatabaseFamily,
  getSqlParserDialect,
  quoteIdentifier,
  supportsMysqlPartition,
} from '../utils/databaseFamily';

describe('database capabilities', () => {
  const mysqlCompatibleDatabases: DatabaseType[] = [
    'mysql',
    'mariadb',
    'tidb',
    'oceanbase',
    'gbase',
    'polardb',
  ];

  it.each(mysqlCompatibleDatabases)('%s 统一声明为 MySQL 族并支持分区', (databaseType) => {
    expect(getDatabaseFamily(databaseType)).toBe('mysql');
    expect(supportsMysqlPartition(databaseType)).toBe(true);
  });

  it.each([
    ['tidb', 'mysql'],
    ['dm', 'mysql'],
    ['oceanbase-oracle', 'mysql'],
    ['kingbase', 'postgresql'],
    ['gaussdb', 'postgresql'],
    ['sqlserver', 'transactsql'],
  ] as const)('%s 使用 %s 解析方言', (databaseType, parserDialect) => {
    expect(getSqlParserDialect(databaseType)).toBe(parserDialect);
  });

  it.each(mysqlCompatibleDatabases)('%s 使用反引号引用标识符', (databaseType) => {
    expect(quoteIdentifier('order`item', databaseType)).toBe('`order``item`');
  });

  it('按数据库族转义标识符中的定界符', () => {
    expect(quoteIdentifier('order]item', 'sqlserver')).toBe('[order]]item]');
    expect(quoteIdentifier('order"item', 'postgresql')).toBe('"order""item"');
  });
});
