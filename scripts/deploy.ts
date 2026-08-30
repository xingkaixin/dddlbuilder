import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  D1_BINDING,
  getWranglerConfigPath,
  runPendingMigrations,
  verifyRequiredD1Tables,
} from './d1-utils';
import { assertAIUsageCronConfigured } from './deploy-config';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repoRoot, 'apps', 'worker', 'wrangler.deploy.toml');
const secretsFile = process.env.WRANGLER_SECRETS_FILE ?? path.join(repoRoot, '.deploy.secrets');
const hasSecretsFile = existsSync(secretsFile);

assertAIUsageCronConfigured(readFileSync(configPath, 'utf8'), configPath);

const runWrangler = (args: string[], captureOutput = false) => {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: repoRoot,
    stdio: captureOutput ? 'pipe' : 'inherit',
    encoding: captureOutput ? 'utf8' : undefined,
    env: process.env,
  });
  if ((result.status ?? 1) !== 0) {
    if (captureOutput) {
      process.stderr.write(result.stderr ?? '');
    }
    process.exit(result.status ?? 1);
  }
  return String(result.stdout ?? '').trim();
};

const recordRecoveryBookmark = () => {
  const timestamp = new Date().toISOString();
  const output = runWrangler(
    [
      'd1',
      'time-travel',
      'info',
      D1_BINDING,
      '--config',
      getWranglerConfigPath('remote'),
      '--json',
    ],
    true,
  );
  console.log(`[deploy] D1 迁移前恢复点 ${timestamp}: ${output}`);
};

if (hasSecretsFile) {
  console.log(`[deploy] 使用 secrets 文件: ${path.relative(repoRoot, secretsFile)}`);
} else {
  console.log('[deploy] 未找到 .deploy.secrets，按现有 Wrangler 配置部署');
}

recordRecoveryBookmark();
runPendingMigrations('remote');
verifyRequiredD1Tables('remote');
console.log('[deploy] remote D1 migrations and runtime tables verified');

const deployArgs = ['deploy', '--config', configPath];
if (hasSecretsFile) {
  deployArgs.push('--secrets-file', secretsFile);
}
runWrangler(deployArgs);
