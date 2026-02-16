import type { DatabaseType } from '@/types';

const ALWAYS_AVAILABLE_TABS = ['fields', 'indexes', 'auth', 'misc'];

const MYSQL_PARTITION_DBS: DatabaseType[] = ['mysql', 'mariadb', 'tidb'];

/**
 * 获取指定数据库类型下可用的 tab 列表
 */
export function getAvailableTabs(dbType: DatabaseType): string[] {
  const tabs = [...ALWAYS_AVAILABLE_TABS];
  if (dbType === 'postgresql-citus') tabs.push('sharding');
  if (MYSQL_PARTITION_DBS.includes(dbType)) tabs.push('partition');
  return tabs;
}

/**
 * 判断指定 tab 在给定数据库类型下是否可用
 */
export function isTabAvailable(tab: string, dbType: DatabaseType): boolean {
  return getAvailableTabs(dbType).includes(tab);
}
