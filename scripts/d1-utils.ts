import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type D1Mode = 'local' | 'remote';

const bunCmd = process.platform === 'win32' ? 'bun.exe' : 'bun';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const D1_BINDING = 'USER_DB';
export const migrationDir = path.join(repoRoot, 'migrations');
export const resetSqlPath = path.join(repoRoot, 'sql', 'reset-user-system.sql');
export const seedSqlPath = path.join(repoRoot, 'seeds', 'user-system.local.sql');

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

  const args = ['x', 'wrangler', 'd1', 'execute', D1_BINDING, getD1Flag(mode)];
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
  const result = spawnSync(bunCmd, buildD1ExecuteArgs(mode, input), {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
};

export const runAllMigrations = (mode: D1Mode): void => {
  for (const file of listMigrationFiles()) {
    console.log(`[d1] applying ${path.relative(repoRoot, file)} (${mode})`);
    runD1Execute(mode, { file });
  }
};
