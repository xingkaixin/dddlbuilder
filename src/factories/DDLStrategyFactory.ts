import type { DatabaseType } from "../types";
import type { DDLStrategy } from "../interfaces/DDLStrategy";
import { MySqlStrategy } from "../strategies/MySqlStrategy";
import { PostgresStrategy } from "../strategies/PostgresStrategy";
import { SqlServerStrategy } from "../strategies/SqlServerStrategy";
import { OracleStrategy } from "../strategies/OracleStrategy";

export class DDLStrategyFactory {
  private static strategies: Map<DatabaseType, DDLStrategy> = new Map([
    ["mysql", new MySqlStrategy()],
    ["postgresql", new PostgresStrategy()],
    ["sqlserver", new SqlServerStrategy()],
    ["oracle", new OracleStrategy()],
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

  static registerStrategy(databaseType: DatabaseType, strategy: DDLStrategy): void {
    this.strategies.set(databaseType, strategy);
  }
}