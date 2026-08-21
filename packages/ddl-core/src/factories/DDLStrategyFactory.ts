import type { DatabaseType } from '@ddlbuilder/shared-types';
import type { DDLStrategy } from '../interfaces/DDLStrategy';
import { ProfiledDDLStrategy } from '../strategies/ProfiledDDLStrategy';
import { HiveStrategy } from '../strategies/HiveStrategy';

const createStrategy = (databaseType: DatabaseType): DDLStrategy =>
  databaseType === 'hive' ? new HiveStrategy() : new ProfiledDDLStrategy(databaseType);

const strategies = new Map<DatabaseType, DDLStrategy>(
  (
    [
      'mysql',
      'postgresql',
      'postgresql-citus',
      'sqlserver',
      'oracle',
      'mariadb',
      'tidb',
      'dm',
      'oceanbase',
      'oceanbase-oracle',
      'kingbase',
      'gbase',
      'polardb',
      'gaussdb',
      'hive',
    ] as DatabaseType[]
  ).map((databaseType) => [databaseType, createStrategy(databaseType)]),
);

export class DDLStrategyFactory {
  static create(databaseType: DatabaseType): DDLStrategy {
    const strategy = strategies.get(databaseType);
    if (!strategy) {
      throw new Error(`Unsupported database type: ${databaseType}`);
    }
    return strategy;
  }

  static getSupportedDatabaseTypes(): DatabaseType[] {
    return Array.from(strategies.keys());
  }
}
