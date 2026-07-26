import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1_BINDING, listMigrationFiles } from './d1-utils';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

type D1RuntimeOptions = {
  configPath: string;
  persistDir: string;
};

type D1QueryResult<T> = Array<{
  results?: T[];
}>;

const runWrangler = (
  options: D1RuntimeOptions,
  sqlInput: { file?: string; command?: string; json?: boolean },
) => {
  const args = [
    'exec',
    'wrangler',
    '--config',
    options.configPath,
    'd1',
    'execute',
    D1_BINDING,
    '--local',
    '--persist-to',
    options.persistDir,
  ];
  if (sqlInput.file) args.push('--file', sqlInput.file);
  if (sqlInput.command) args.push('--command', sqlInput.command);
  if (sqlInput.json) args.push('--json');

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
  const payload = JSON.parse(output) as D1QueryResult<T>;
  return payload[0]?.results ?? [];
};

export const prepareLocalD1Runtime = (options: D1RuntimeOptions): void => {
  mkdirSync(options.persistDir, { recursive: true });
  for (const file of listMigrationFiles()) {
    runWrangler(options, { file });
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
  configPath: 'apps/worker/wrangler.e2e.toml',
  persistDir: path.join(repoRoot, '.wrangler', 'state', 'e2e'),
} satisfies D1RuntimeOptions;

export const REQUIRED_RUNTIME_TABLES = [
  'account',
  'admin_sessions',
  'admin_user_flags',
  'ai_governance_counters',
  'credit_accounts',
  'credit_ledger',
  'request_rate_limits',
  'session',
  'usage_events',
  'user',
  'verification',
  'workspace_clocks',
  'workspace_entities',
  'workspace_links',
  'workspace_mutations',
  'workspace_snapshots',
  'workspaces',
] as const;
