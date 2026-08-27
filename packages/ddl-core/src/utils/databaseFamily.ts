import type { DatabaseType } from '@ddlbuilder/shared-types';

export type DatabaseFamily = 'mysql' | 'postgresql' | 'sqlserver' | 'oracle' | 'dm' | 'hive';

export type SqlParserDialect = 'mysql' | 'mariadb' | 'postgresql' | 'transactsql' | 'hive';

interface DatabaseCapabilities {
  family: DatabaseFamily;
  parserDialect: SqlParserDialect;
}

const DATABASE_CAPABILITIES = {
  mysql: { family: 'mysql', parserDialect: 'mysql' },
  mariadb: { family: 'mysql', parserDialect: 'mariadb' },
  tidb: { family: 'mysql', parserDialect: 'mysql' },
  oceanbase: { family: 'mysql', parserDialect: 'mysql' },
  gbase: { family: 'mysql', parserDialect: 'mysql' },
  polardb: { family: 'mysql', parserDialect: 'mysql' },
  postgresql: { family: 'postgresql', parserDialect: 'postgresql' },
  'postgresql-citus': { family: 'postgresql', parserDialect: 'postgresql' },
  kingbase: { family: 'postgresql', parserDialect: 'postgresql' },
  gaussdb: { family: 'postgresql', parserDialect: 'postgresql' },
  sqlserver: { family: 'sqlserver', parserDialect: 'transactsql' },
  oracle: { family: 'oracle', parserDialect: 'mysql' },
  'oceanbase-oracle': { family: 'oracle', parserDialect: 'mysql' },
  dm: { family: 'dm', parserDialect: 'mysql' },
  hive: { family: 'hive', parserDialect: 'hive' },
} as const satisfies Record<DatabaseType, DatabaseCapabilities>;

export const getDatabaseFamily = (databaseType: DatabaseType): DatabaseFamily | undefined =>
  (DATABASE_CAPABILITIES as Partial<Record<DatabaseType, DatabaseCapabilities>>)[databaseType]
    ?.family;

export const getSqlParserDialect = (databaseType: DatabaseType): SqlParserDialect =>
  DATABASE_CAPABILITIES[databaseType].parserDialect;

export const supportsMysqlPartition = (databaseType: DatabaseType): boolean =>
  getDatabaseFamily(databaseType) === 'mysql';

export const quoteIdentifier = (identifier: string, databaseType: DatabaseType): string => {
  switch (getDatabaseFamily(databaseType)) {
    case 'mysql':
    case 'hive':
      return `\`${identifier.replace(/`/g, '``')}\``;
    case 'sqlserver':
      return `[${identifier.replace(/]/g, ']]')}]`;
    default:
      return `"${identifier.replace(/"/g, '""')}"`;
  }
};

export const expandDatabaseFamilies = <T>(
  values: Record<DatabaseFamily, T>,
): Record<DatabaseType, T> =>
  Object.fromEntries(
    Object.entries(DATABASE_CAPABILITIES).map(([databaseType, capabilities]) => [
      databaseType,
      values[capabilities.family],
    ]),
  ) as Record<DatabaseType, T>;
