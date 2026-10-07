import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildD1ExecuteArgs, listMigrationFiles, writeLocalD1Config } from './d1-utils';

export { REQUIRED_RUNTIME_TABLES } from './d1-utils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type D1RuntimeOptions = {
  mode: 'development' | 'e2e';
  persistDir: string;
};

type D1QueryResult<T> = Array<{
  results?: T[];
}>;

const runWrangler = (
  options: D1RuntimeOptions,
  sqlInput: { file?: string; command?: string; json?: boolean },
) => {
  const args = buildD1ExecuteArgs(writeLocalD1Config(options.mode), options.persistDir, sqlInput);

  const result = spawnSync('pnpm', args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if ((result.status ?? 1) !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    throw new Error(`D1 runtime command failed:\n${output}`);
  }

  return result.stdout;
};

export const queryLocalD1 = <T>(options: D1RuntimeOptions, command: string): T[] => {
  const output = runWrangler(options, { command, json: true });
  // SAFETY: Wrangler was invoked with --json, whose documented local output is an array of query results.
  const payload = JSON.parse(output) as D1QueryResult<T>;

  return payload[0]?.results ?? [];
};

export const prepareLocalD1Runtime = (options: D1RuntimeOptions): void => {
  mkdirSync(options.persistDir, { recursive: true });

  // 每次调用 wrangler 都要启动一次本地运行时，逐个迁移执行会让 E2E 启动超时
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ddlbuilder-d1-migrations-'));
  const file = path.join(tempDir, 'migrations.sql');

  try {
    writeFileSync(
      file,
      listMigrationFiles()
        .map((migration) => readFileSync(migration, 'utf8'))
        .join('\n'),
    );
    runWrangler(options, { file });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
};

export const verifyLocalD1Runtime = (
  options: D1RuntimeOptions,
  requiredTables: readonly string[],
): void => {
  const rows = queryLocalD1<{ name: string }>(
    options,
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  );
  const actualTables = new Set(rows.map((row) => row.name));
  const missingTables = requiredTables.filter((table) => !actualTables.has(table));

  if (missingTables.length > 0) {
    throw new Error(`D1 runtime is missing tables: ${missingTables.join(', ')}`);
  }

  const foreignKeys = queryLocalD1<{ foreign_keys: number }>(options, 'PRAGMA foreign_keys');

  if (foreignKeys[0]?.foreign_keys !== 1) {
    throw new Error('D1 runtime did not enable foreign key enforcement');
  }
};

export const e2eD1RuntimeOptions = {
  mode: 'e2e',
  persistDir: path.join(repoRoot, '.wrangler', 'state', 'e2e'),
} satisfies D1RuntimeOptions;
