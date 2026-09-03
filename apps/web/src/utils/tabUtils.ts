import { supportsMysqlPartition } from '@ddlbuilder/ddl-core';
import type { DatabaseType, SchemaObjectType } from '@ddlbuilder/shared-types';

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

const TABLE_TABS = ['fields', 'indexes', 'foreignKeys', 'auth', 'misc'] satisfies BuilderTab[];
const VIEW_TABS = ['fields', 'auth'] satisfies BuilderTab[];

const HIVE_DISABLED_TABS = new Set<BuilderTab>(['indexes', 'foreignKeys']);

export function isBuilderTab(value: string): value is BuilderTab {
  return BUILDER_TABS.some((tab) => tab === value);
}

interface BuilderTabContext {
  objectType: SchemaObjectType;
  dbType: DatabaseType;
}

export function getAvailableTabs({ objectType, dbType }: BuilderTabContext): BuilderTab[] {
  if (objectType === 'view') return [...VIEW_TABS];

  const tabs: BuilderTab[] = [...TABLE_TABS];
  if (dbType === 'postgresql-citus') tabs.push('sharding');
  if (supportsMysqlPartition(dbType)) tabs.push('partition');
  if (dbType === 'hive') tabs.push('hive-partition');

  if (dbType === 'hive') {
    return tabs.filter((tab) => !HIVE_DISABLED_TABS.has(tab));
  }

  return tabs;
}

export function isTabAvailable(tab: BuilderTab, context: BuilderTabContext): boolean {
  return getAvailableTabs(context).includes(tab);
}

export function resolveActiveTab(tab: BuilderTab, context: BuilderTabContext): BuilderTab {
  return isTabAvailable(tab, context) ? tab : 'fields';
}
