import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { fileURLToPath, URL } from 'node:url';

interface SqliteD1Options {
  includeMeta?: boolean;
}

type SqliteRow = Record<string, SQLInputValue>;

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

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this adapter validates the platform's untyped D1 binding boundary.
const normalizeD1Binding = (value: unknown): SQLInputValue => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- primitive checks are the D1 binding contract.
  if (value === null || typeof value === 'number' || typeof value === 'string') return value;
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- primitive checks are the D1 binding contract.
  if (typeof value === 'boolean') return Number(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the error identifies the rejected platform value.
  throw new TypeError(`Unsupported D1 binding type: ${typeof value}`);
};

class SqliteD1Statement {
  private readonly statement: StatementSync;
  private readonly sql: string;
  private readonly includeMeta: boolean;
  private readonly bindings: SQLInputValue[];

  constructor(
    statement: StatementSync,
    sql: string,
    includeMeta: boolean,
    bindings: SQLInputValue[] = [],
  ) {
    this.statement = statement;
    this.sql = sql;
    this.includeMeta = includeMeta;
    this.bindings = bindings;
  }

  bind(...bindings: unknown[]) {
    return new SqliteD1Statement(
      this.statement,
      this.sql,
      this.includeMeta,
      bindings.map(normalizeD1Binding),
    );
  }

  async first<T>(column?: string): Promise<T | null> {
    // SAFETY: node:sqlite returns rows whose values are the scalar values accepted by D1.
    const row = this.statement.get(...this.bindings) as SqliteRow | undefined;

    if (!row) return null;

    // SAFETY: callers request either the full typed row or one value from this D1 test adapter.
    return (column ? row[column] : row) as T;
  }

  async all<T>() {
    // SAFETY: the generic is the caller's known row contract for this test adapter.
    const results = this.statement.all(...this.bindings) as T[];

    return this.withMeta({ success: true, results }, this.isReadQuery() ? results.length : 0, 0);
  }

  async raw<T>(options?: { columnNames?: boolean }) {
    const columns = this.statement.columns().map((column) => column.name);
    const rows = (await this.all<SqliteRow>()).results ?? [];
    // SAFETY: raw() returns the caller-selected generic representation of the SQLite scalar rows.
    const values = rows.map((row) => columns.map((column) => row[column])) as T[];

    // SAFETY: D1 raw() uses the same generic array contract for named and unnamed column results.
    return options?.columnNames ? ([columns, ...values] as T[]) : values;
  }

  async run<T>() {
    if (this.statement.columns().length > 0) {
      // SAFETY: the generic is the caller's known row contract for this test adapter.
      const results = this.statement.all(...this.bindings) as T[];

      return this.withMeta({ success: true, results }, 0, results.length);
    }

    const result = this.statement.run(...this.bindings);

    // SAFETY: this empty result has the same generic row contract as the statement branch above.
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
        changes: rowsWritten,
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

  // SAFETY: this adapter implements the D1 methods exercised by the worker tests.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions -- the SQLite-backed fixture implements the D1 methods used by tests.
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
