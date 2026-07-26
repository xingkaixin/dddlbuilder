import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type D1Mode = 'local' | 'remote';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const D1_BINDING = 'USER_DB';
export const getWranglerConfigPath = (mode: D1Mode) =>
  mode === 'remote' ? 'apps/worker/wrangler.deploy.toml' : 'apps/worker/wrangler.toml';
export const migrationDir = path.join(repoRoot, 'packages', 'db', 'migrations');
export const resetSqlPath = path.join(repoRoot, 'sql', 'reset-user-system.sql');
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

const runD1ExecuteJson = <T>(mode: D1Mode, input: { file?: string; command?: string }): T => {
  const result = spawnSync('pnpm', buildD1ExecuteArgs(mode, { ...input, json: true }), {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if ((result.status ?? 1) !== 0) {
    process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout) as T;
};

const queryD1Rows = <T>(mode: D1Mode, command: string): T[] => {
  const payload = runD1ExecuteJson<Array<{ results?: T[] }>>(mode, { command });
  return payload[0]?.results ?? [];
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
  const rows = queryD1Rows<{ name: string }>(
    mode,
    'SELECT name FROM __ddlbuilder_migrations ORDER BY name',
  );
  return new Set(rows.map((row) => row.name));
};

const hasExistingAppSchema = (mode: D1Mode): boolean => {
  const rows = queryD1Rows<{ name: string }>(
    mode,
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('users', 'workspace_snapshots')
      LIMIT 1
    `,
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

export const runAllMigrations = (mode: D1Mode): void => {
  for (const file of listMigrationFiles()) {
    console.log(`[d1] applying ${path.relative(repoRoot, file)} (${mode})`);
    runD1Execute(mode, { file });
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
