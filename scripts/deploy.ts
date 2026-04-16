import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bunCmd = process.platform === 'win32' ? 'bun.exe' : 'bun';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(repoRoot, 'apps', 'worker', 'wrangler.deploy.toml');
const secretsFile = process.env.WRANGLER_SECRETS_FILE ?? path.join(repoRoot, '.deploy.secrets');

const args = ['x', 'wrangler', 'deploy', '--config', configPath];

if (existsSync(secretsFile)) {
  args.push('--secrets-file', secretsFile);
  console.log(`[deploy] 使用 secrets 文件: ${path.relative(repoRoot, secretsFile)}`);
} else {
  console.log('[deploy] 未找到 .deploy.secrets，按现有 Wrangler 配置部署');
}

const result = spawnSync(bunCmd, args, {
  cwd: repoRoot,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
