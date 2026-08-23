import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

interface SqliteD1Options {
  includeMeta?: boolean;
}

const migrationsDirectory = fileURLToPath(
  new URL('../../../../../packages/db/migrations/', import.meta.url),
);

const applyMigrations = (sqlite: DatabaseSync) => {
  const migrationFiles = readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const migrationFile of migrationFiles) {
    sqlite.exec(readFileSync(`${migrationsDirectory}/${migrationFile}`, 'utf8'));
  }
};

const normalizeBindings = (bindings: unknown[]) =>
  bindings.map((value) => (value instanceof ArrayBuffer ? new Uint8Array(value) : value));

class SqliteD1Statement {
  constructor(
    private readonly statement: StatementSync,
    private readonly sql: string,
    private readonly includeMeta: boolean,
    private readonly bindings: unknown[] = [],
  ) {}

  bind(...bindings: unknown[]) {
    return new SqliteD1Statement(this.statement, this.sql, this.includeMeta, bindings);
  }

  async first<T>(column?: string): Promise<T | null> {
    const row = this.statement.get(...normalizeBindings(this.bindings)) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async all<T>() {
    const results = this.statement.all(...normalizeBindings(this.bindings)) as T[];
    return this.withMeta({ success: true, results }, this.isReadQuery() ? results.length : 0, 0);
  }

  async raw<T>(options?: { columnNames?: boolean }) {
    const columns = this.statement.columns().map((column) => column.name);
    const rows = (await this.all<Record<string, unknown>>()).results ?? [];
    const values = rows.map((row) => columns.map((column) => row[column])) as T[];
    return options?.columnNames ? ([columns, ...values] as T[]) : values;
  }

  async run<T>() {
    if (this.statement.columns().length > 0) {
      const results = this.statement.all(...normalizeBindings(this.bindings)) as T[];
      return this.withMeta({ success: true, results }, 0, results.length);
    }

    const result = this.statement.run(...normalizeBindings(this.bindings));
    return this.withMeta({ success: true, results: [] as T[] }, 0, Number(result.changes));
  }

  private isReadQuery() {
    return /^\s*(SELECT|WITH)\b/i.test(this.sql);
  }

  private withMeta<T extends Record<string, unknown>>(
    result: T,
    rowsRead: number,
    rowsWritten: number,
  ) {
    if (!this.includeMeta) return result;
    return {
      ...result,
      meta: {
        rows_read: rowsRead,
        rows_written: rowsWritten,
        duration: 1,
      },
    };
  }
}

export const createSqliteD1Database = (options: SqliteD1Options = {}) => {
  const sqlite = new DatabaseSync(':memory:');
  applyMigrations(sqlite);

  const database = {
    prepare(sql: string) {
      return new SqliteD1Statement(sqlite.prepare(sql), sql, options.includeMeta === true);
    },
    async batch(statements: SqliteD1Statement[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as D1Database;

  return { database, sqlite };
};
