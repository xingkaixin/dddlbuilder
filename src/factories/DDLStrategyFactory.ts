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

export class DDLStrategyFactory {
  private static strategies: Map<DatabaseType, DDLStrategy> = new Map([
    ['mysql', new MySqlStrategy()],
    ['postgresql', new PostgresStrategy()],
    ['sqlserver', new SqlServerStrategy()],
    ['oracle', new OracleStrategy()],
    ['mariadb', new MariaDbStrategy()],
    ['tidb', new TiDbStrategy()],
    ['dm', new DmStrategy()],
    ['oceanbase', new OceanBaseMySqlStrategy()],
    ['oceanbase-oracle', new OceanBaseOracleStrategy()],
  ]);

  static create(databaseType: DatabaseType): DDLStrategy {
    const strategy = this.strategies.get(databaseType);
    if (!strategy) {
      throw new Error(`Unsupported database type: ${databaseType}`);
    }
    return strategy;
  }

  static getSupportedDatabaseTypes(): DatabaseType[] {
    return Array.from(this.strategies.keys());
  }

  static registerStrategy(
    databaseType: DatabaseType,
    strategy: DDLStrategy,
  ): void {
    this.strategies.set(databaseType, strategy);
  }
}
