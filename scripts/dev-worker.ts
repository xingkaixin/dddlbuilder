import { spawn, spawnSync } from 'node:child_process';

const bunCmd = process.platform === 'win32' ? 'bun.exe' : 'bun';
const workerPort = process.env.WORKER_DEV_PORT ?? '8787';

const build = spawnSync(bunCmd, ['run', 'build:wrangler-dev'], {
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const child = spawn(
  bunCmd,
  ['x', 'wrangler', 'dev', '--port', workerPort, '--inspector-port', '0'],
  {
    stdio: 'inherit',
    env: process.env,
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
