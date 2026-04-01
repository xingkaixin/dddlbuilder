import { spawn, spawnSync, type ChildProcess } from 'node:child_process';

const bunCmd = process.platform === 'win32' ? 'bun.exe' : 'bun';
const appPort = process.env.APP_DEV_PORT ?? '3000';

const build = spawnSync(bunCmd, ['run', 'build:wrangler-dev'], {
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const children: ChildProcess[] = [];
let shuttingDown = false;

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child.killed || child.exitCode !== null) continue;
    child.kill('SIGTERM');
  }

  setTimeout(() => {
    for (const child of children) {
      if (child.killed || child.exitCode !== null) continue;
      child.kill('SIGKILL');
    }
    process.exit(code);
  }, 1_000).unref();
};

const start = (label: string, args: string[]) => {
  const child = spawn(bunCmd, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_DEV_PORT: appPort,
    },
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;

    if (signal) {
      console.error(`[dev] ${label} exited with signal ${signal}`);
      shutdown(1);
      return;
    }

    if ((code ?? 0) !== 0) {
      console.error(`[dev] ${label} exited with code ${code ?? 1}`);
      shutdown(code ?? 1);
    }
  });

  child.on('error', (error) => {
    if (shuttingDown) return;
    console.error(`[dev] failed to start ${label}: ${String(error)}`);
    shutdown(1);
  });

  children.push(child);
};

start('app', ['x', 'wrangler', 'dev', '--port', appPort]);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
