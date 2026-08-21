import type { DatabaseType } from '@ddlbuilder/shared-types';

export type DatabaseFamily = 'mysql' | 'postgresql' | 'sqlserver' | 'oracle' | 'dm' | 'hive';

const DATABASE_FAMILIES = {
  mysql: 'mysql',
  mariadb: 'mysql',
  tidb: 'mysql',
  oceanbase: 'mysql',
  gbase: 'mysql',
  polardb: 'mysql',
  postgresql: 'postgresql',
  'postgresql-citus': 'postgresql',
  kingbase: 'postgresql',
  gaussdb: 'postgresql',
  sqlserver: 'sqlserver',
  oracle: 'oracle',
  'oceanbase-oracle': 'oracle',
  dm: 'dm',
  hive: 'hive',
} as const satisfies Record<DatabaseType, DatabaseFamily>;

export const getDatabaseFamily = (databaseType: DatabaseType): DatabaseFamily =>
  DATABASE_FAMILIES[databaseType];

export const expandDatabaseFamilies = <T>(
  values: Record<DatabaseFamily, T>,
): Record<DatabaseType, T> => ({
  mysql: values.mysql,
  mariadb: values.mysql,
  tidb: values.mysql,
  oceanbase: values.mysql,
  gbase: values.mysql,
  polardb: values.mysql,
  postgresql: values.postgresql,
  'postgresql-citus': values.postgresql,
  kingbase: values.postgresql,
  gaussdb: values.postgresql,
  sqlserver: values.sqlserver,
  oracle: values.oracle,
  'oceanbase-oracle': values.oracle,
  dm: values.dm,
  hive: values.hive,
});
