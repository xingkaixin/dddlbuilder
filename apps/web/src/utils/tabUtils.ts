import type { DatabaseType } from '@ddlbuilder/shared-types';

export const BUILDER_TABS = [
  'fields',
  'indexes',
  'foreignKeys',
  'auth',
  'misc',
  'sharding',
  'partition',
  'hive-partition',
] as const;

export type BuilderTab = (typeof BUILDER_TABS)[number];

const ALWAYS_AVAILABLE_TABS = [
  'fields',
  'indexes',
  'foreignKeys',
  'auth',
  'misc',
] satisfies BuilderTab[];

const MYSQL_PARTITION_DBS: DatabaseType[] = ['mysql', 'mariadb', 'tidb'];

// Hive 不支持的 tab
const HIVE_DISABLED_TABS = new Set<BuilderTab>(['indexes', 'foreignKeys']);

export function isBuilderTab(value: string): value is BuilderTab {
  return BUILDER_TABS.some((tab) => tab === value);
}

/**
 * 获取指定数据库类型下可用的 tab 列表
 */
export function getAvailableTabs(dbType: DatabaseType): BuilderTab[] {
  const tabs: BuilderTab[] = [...ALWAYS_AVAILABLE_TABS];
  if (dbType === 'postgresql-citus') tabs.push('sharding');
  if (MYSQL_PARTITION_DBS.includes(dbType)) tabs.push('partition');
  if (dbType === 'hive') tabs.push('hive-partition');

  // 移除该数据库类型不支持的 tab
  if (dbType === 'hive') {
    return tabs.filter((tab) => !HIVE_DISABLED_TABS.has(tab));
  }

  return tabs;
}

/**
 * 判断指定 tab 在给定数据库类型下是否可用
 */
export function isTabAvailable(tab: BuilderTab, dbType: DatabaseType): boolean {
  return getAvailableTabs(dbType).includes(tab);
}
