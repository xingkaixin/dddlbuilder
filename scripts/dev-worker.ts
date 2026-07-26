import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workerPort = process.env.WORKER_DEV_PORT ?? '8787';
const persistDir = process.env.WRANGLER_PERSIST_DIR ?? '.wrangler/state/dev';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workerDir = path.join(repoRoot, 'apps', 'worker');

const runPreflight = (label: string, args: string[]) => {
  console.log(`[dev:worker] ${label}`);
  const result = spawnSync('pnpm', args, {
    stdio: 'inherit',
    cwd: repoRoot,
    env: {
      ...process.env,
      WRANGLER_PERSIST_DIR: persistDir,
    },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

runPreflight('applying pending D1 migrations', ['run', 'db:migrate:local']);
runPreflight('building Worker runtime assets', ['run', 'build:wrangler-dev']);

const child = spawn(
  'pnpm',
  [
    'exec',
    'wrangler',
    'dev',
    '--port',
    workerPort,
    '--inspector-port',
    '0',
    '--persist-to',
    path.resolve(repoRoot, persistDir),
  ],
  {
    stdio: 'inherit',
    env: process.env,
    cwd: workerDir,
  },
);

let shuttingDown = false;

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (!child.killed && child.exitCode === null) {
    child.kill('SIGTERM');
  }

  setTimeout(() => {
    if (!child.killed && child.exitCode === null) {
      child.kill('SIGKILL');
    }
    process.exit(code);
  }, 1_000).unref();
};

child.on('exit', (code, signal) => {
  if (shuttingDown) return;

  if (signal) {
    console.error(`[dev:worker] wrangler exited with signal ${signal}`);
    shutdown(1);
    return;
  }

  if ((code ?? 0) !== 0) {
    console.error(`[dev:worker] wrangler exited with code ${code ?? 1}`);
    shutdown(code ?? 1);
  }
});

child.on('error', (error) => {
  if (shuttingDown) return;
  console.error(`[dev:worker] failed to start wrangler: ${String(error)}`);
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
