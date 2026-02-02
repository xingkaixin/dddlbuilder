import type { DatabaseType } from '../types';
import type { DDLStrategy } from '../interfaces/DDLStrategy';
import { MySqlStrategy } from '../strategies/MySqlStrategy';
import { PostgresStrategy } from '../strategies/PostgresStrategy';
import { SqlServerStrategy } from '../strategies/SqlServerStrategy';
import { OracleStrategy } from '../strategies/OracleStrategy';
import { MariaDbStrategy } from '../strategies/MariaDbStrategy';
import { TiDbStrategy } from '../strategies/TiDbStrategy';
import { DmStrategy } from '../strategies/DmStrategy';
import { OceanBaseMySqlStrategy } from '../strategies/OceanBaseMySqlStrategy';
import { OceanBaseOracleStrategy } from '../strategies/OceanBaseOracleStrategy';
import { KingbaseStrategy } from '../strategies/KingbaseStrategy';
import { GBaseStrategy } from '../strategies/GBaseStrategy';
import { PolarDbStrategy } from '../strategies/PolarDbStrategy';
import { GaussDbStrategy } from '../strategies/GaussDbStrategy';

const strategies = new Map<DatabaseType, DDLStrategy>();

strategies.set('mysql', new MySqlStrategy());
strategies.set('postgresql', new PostgresStrategy());
strategies.set('postgresql-citus', new PostgresStrategy('postgresql-citus'));
strategies.set('sqlserver', new SqlServerStrategy());
strategies.set('oracle', new OracleStrategy());
strategies.set('mariadb', new MariaDbStrategy());
strategies.set('tidb', new TiDbStrategy());
strategies.set('dm', new DmStrategy());
strategies.set('oceanbase', new OceanBaseMySqlStrategy());
strategies.set('oceanbase-oracle', new OceanBaseOracleStrategy());
strategies.set('kingbase', new KingbaseStrategy());
strategies.set('gbase', new GBaseStrategy());
strategies.set('polardb', new PolarDbStrategy());
strategies.set('gaussdb', new GaussDbStrategy());

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

  static registerStrategy(
    databaseType: DatabaseType,
    strategy: DDLStrategy,
  ): void {
    strategies.set(databaseType, strategy);
  }
}
