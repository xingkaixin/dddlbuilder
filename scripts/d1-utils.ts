import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type D1Mode = 'local' | 'remote';

type D1JsonValue = null | boolean | number | string | D1JsonObject | D1JsonValue[];

type D1JsonObject = { [key: string]: D1JsonValue };

type NamedRow = { name: string };

type SchemaRow = { type: string; name: string };

const isRecord = (value: D1JsonValue): value is D1JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringValue = (value: D1JsonValue): value is string => typeof value === 'string';

const decodeNamedRow = (value: D1JsonValue): NamedRow => {
  if (!isRecord(value) || !isStringValue(value.name)) {
    throw new Error('D1 JSON row is missing a string name');
  }

  return { name: value.name };
};

const decodeSchemaRow = (value: D1JsonValue): SchemaRow => {
  if (!isRecord(value) || !isStringValue(value.type) || !isStringValue(value.name)) {
    throw new Error('D1 JSON row is missing string type/name');
  }

  return { type: value.type, name: value.name };
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const D1_BINDING = 'USER_DB';

export const getWranglerConfigPath = (mode: D1Mode) =>
  mode === 'remote' ? 'apps/worker/wrangler.deploy.toml' : 'apps/worker/wrangler.toml';
export const migrationDir = path.join(repoRoot, 'packages', 'db', 'migrations');
export const seedSqlPath = path.join(repoRoot, 'packages', 'db', 'seeds', 'user-system.local.sql');
export const localPersistDir =
  process.env.WRANGLER_PERSIST_DIR ?? path.join('.wrangler', 'state', 'dev');

export const resolveD1Mode = (args: string[]): D1Mode =>
  args.includes('--remote') ? 'remote' : 'local';

export const getD1Flag = (mode: D1Mode): '--local' | '--remote' =>
  mode === 'remote' ? '--remote' : '--local';

export const listMigrationFiles = (dir = migrationDir): string[] =>
  readdirSync(dir)
    .filter((name) => /^\d{4}_.+\.sql$/u.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(dir, name));

// 重放迁移文件中的建表/删表/改名语句，派生出最终 schema 应存在的表，
// 避免手工维护第二份清单随迁移演进漂移。同名表在迁移中先删后建，必须按语句顺序重放
const deriveRequiredRuntimeTables = (dir: string): string[] => {
  const tables = new Set<string>();
  const statements: Array<{ index: number; apply: () => void }> = [];

  for (const file of listMigrationFiles(dir)) {
    const sql = readFileSync(file, 'utf8');
    const scoped: Array<{ index: number; apply: () => void }> = [];

    for (const match of sql.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?"?(\w+)"?/gi)) {
      scoped.push({ index: match.index ?? 0, apply: () => tables.add(match[1]) });
    }

    for (const match of sql.matchAll(/DROP TABLE (?:IF EXISTS )?"?(\w+)"?/gi)) {
      scoped.push({ index: match.index ?? 0, apply: () => tables.delete(match[1]) });
    }

    for (const match of sql.matchAll(/ALTER TABLE "?(\w+)"? RENAME TO "?(\w+)"?/gi)) {
      scoped.push({
        index: match.index ?? 0,
        apply: () => {
          tables.delete(match[1]);
          tables.add(match[2]);
        },
      });
    }

    statements.push(...scoped.sort((a, b) => a.index - b.index));
  }

  for (const { apply } of statements) apply();

  return [...tables].sort();
};

export const REQUIRED_RUNTIME_TABLES = deriveRequiredRuntimeTables(migrationDir);

export const buildD1ExecuteArgs = (
  mode: D1Mode,
  input: { file?: string; command?: string; json?: boolean },
): string[] => {
  if (!input.file && !input.command) {
    throw new Error('缺少 SQL 输入');
  }

  const args = [
    'exec',
    'wrangler',
    '--config',
    getWranglerConfigPath(mode),
    'd1',
    'execute',
    D1_BINDING,
    getD1Flag(mode),
  ];

  if (mode === 'local') {
    args.push('--persist-to', localPersistDir);
  }

  if (input.file) {
    args.push('--file', input.file);
  }

  if (input.command) {
    args.push('--command', input.command);
  }

  if (input.json) {
    args.push('--json');
  }

  return args;
};

export const runD1Execute = (
  mode: D1Mode,
  input: { file?: string; command?: string; json?: boolean },
): void => {
  const result = spawnSync('pnpm', buildD1ExecuteArgs(mode, input), {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runD1ExecuteJson = (
  mode: D1Mode,
  input: { file?: string; command?: string },
): D1JsonValue => {
  const result = spawnSync('pnpm', buildD1ExecuteArgs(mode, { ...input, json: true }), {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if ((result.status ?? 1) !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
};

const queryD1Rows = <T>(mode: D1Mode, command: string, decode: (value: D1JsonValue) => T): T[] => {
  const payload = runD1ExecuteJson(mode, { command });

  if (!Array.isArray(payload)) throw new Error('D1 JSON output must be an array');

  const first = payload[0];

  if (!isRecord(first) || !Array.isArray(first.results)) {
    throw new Error('D1 JSON output is missing a results array');
  }

  return first.results.map(decode);
};

const ensureMigrationLedger = (mode: D1Mode): void => {
  runD1Execute(mode, {
    command: `
      CREATE TABLE IF NOT EXISTS __ddlbuilder_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
  });
};

const listAppliedMigrations = (mode: D1Mode): Set<string> => {
  const rows = queryD1Rows(
    mode,
    'SELECT name FROM __ddlbuilder_migrations ORDER BY name',
    decodeNamedRow,
  );

  return new Set(rows.map((row) => row.name));
};

const hasExistingAppSchema = (mode: D1Mode): boolean => {
  const rows = queryD1Rows(
    mode,
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('users', 'workspace_snapshots')
      LIMIT 1
    `,
    decodeNamedRow,
  );

  return rows.length > 0;
};

const recordMigration = (mode: D1Mode, name: string): void => {
  runD1Execute(mode, {
    command: `INSERT OR IGNORE INTO __ddlbuilder_migrations (name) VALUES (${JSON.stringify(name)})`,
  });
};

export const baselineExistingMigrations = (mode: D1Mode, throughName: string): void => {
  ensureMigrationLedger(mode);

  if (listAppliedMigrations(mode).size > 0) {
    throw new Error('迁移账本不为空，拒绝重复 baseline');
  }

  if (!hasExistingAppSchema(mode)) {
    throw new Error('未检测到既有业务表，无需 baseline；请直接运行迁移');
  }

  const migrations = listMigrationFiles();
  const throughIndex = migrations.findIndex((file) => path.basename(file) === throughName);

  if (throughIndex < 0) {
    throw new Error(`未知迁移：${throughName}`);
  }

  for (const file of migrations.slice(0, throughIndex + 1)) {
    recordMigration(mode, path.basename(file));
  }
};

export const resetDatabase = (mode: D1Mode): void => {
  // 反创建序返回：子表的 FK 父表总是创建得更早，倒序 drop 即合法依赖序
  const rows = queryD1Rows(
    mode,
    `
      SELECT type, name
      FROM sqlite_master
      WHERE type IN ('table', 'trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
      ORDER BY rowid DESC
    `,
    decodeSchemaRow,
  );
  const dropStatement = ({ type, name }: { type: string; name: string }) =>
    `DROP ${type.toUpperCase()} IF EXISTS "${name}"`;
  const triggers = rows.filter(({ type }) => type === 'trigger');
  const tables = rows.filter(({ type }) => type === 'table');

  for (const statement of [...triggers, ...tables].map(dropStatement)) {
    // 逐条执行：打包成单条多语句时，父表先删会触发后续语句对 FK 父表的解析失败
    runD1Execute(mode, { command: statement });
  }
};

export const runPendingMigrations = (mode: D1Mode): void => {
  ensureMigrationLedger(mode);

  const migrations = listMigrationFiles();
  const applied = listAppliedMigrations(mode);

  if (applied.size === 0 && hasExistingAppSchema(mode)) {
    throw new Error(
      '检测到既有业务表但迁移账本为空。请先显式运行 db:baseline:* -- --through <migration.sql>',
    );
  }

  for (const file of migrations) {
    const name = path.basename(file);

    if (applied.has(name)) {
      continue;
    }

    console.log(`[d1] applying ${path.relative(repoRoot, file)} (${mode})`);
    runD1Execute(mode, { file });
    recordMigration(mode, name);
  }
};

export const verifyRequiredD1Tables = (
  mode: D1Mode,
  requiredTables: readonly string[] = REQUIRED_RUNTIME_TABLES,
): void => {
  const rows = queryD1Rows(
    mode,
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    decodeNamedRow,
  );
  const actualTables = new Set(rows.map((row) => row.name));
  const missingTables = requiredTables.filter((table) => !actualTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(`D1 缺少运行时必需表：${missingTables.join(', ')}`);
  }
};
