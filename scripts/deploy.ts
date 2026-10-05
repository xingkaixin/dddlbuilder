import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workerDirectory } from '../apps/worker/cloudflare.config';
import { runPendingMigrations, verifyRequiredD1Tables } from './d1-utils';
import { readWorkerConfig } from './deploy-config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secretsFile = path.resolve(
  process.env.CF_SECRETS_FILE ??
    process.env.WRANGLER_SECRETS_FILE ??
    path.join(repoRoot, '.deploy.secrets'),
);
const hasSecretsFile = existsSync(secretsFile);
const worker = readWorkerConfig('production');
const databaseId = worker.env.USER_DB.id;

if (!databaseId) throw new Error('Production D1 database ID is required');

const runCF = (args: string[], captureOutput = false) => {
  const result = spawnSync('cf', args, {
    cwd: workerDirectory,
    stdio: captureOutput ? 'pipe' : 'inherit',
    encoding: captureOutput ? 'utf8' : undefined,
    env: process.env,
  });

  if ((result.status ?? 1) !== 0) {
    if (captureOutput) process.stderr.write(result.stderr ?? '');
    process.exit(result.status ?? 1);
  }

  return String(result.stdout ?? '').trim();
};

runCF(['deploy', '--mode', 'production', '--dry-run']);

const bookmark = runCF(['d1', 'time-travel', 'get-bookmark', databaseId], true);

console.log(`[deploy] D1 迁移前恢复点 ${new Date().toISOString()}: ${bookmark}`);

runPendingMigrations('remote');

verifyRequiredD1Tables('remote');

console.log('[deploy] remote D1 migrations and runtime tables verified');

const deployArgs = ['deploy', '--mode', 'production', '--prebuilt'];

if (hasSecretsFile) {
  console.log(`[deploy] 使用 secrets 文件: ${path.relative(repoRoot, secretsFile)}`);
  deployArgs.push('--secrets-file', secretsFile);
} else {
  console.log('[deploy] 未找到 .deploy.secrets，保留线上 secrets');
}

runCF(deployArgs);
