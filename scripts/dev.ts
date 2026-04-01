import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';

const bunCmd = process.platform === 'win32' ? 'bun.exe' : 'bun';
const appPort = process.env.APP_DEV_PORT ?? '3000';
const docsPort = process.env.DOCS_DEV_PORT ?? '5174';

const build = spawnSync(bunCmd, ['run', 'build:wrangler-dev'], {
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const children: ChildProcess[] = [];
let shuttingDown = false;

const isPortOpen = (port: string, host = '127.0.0.1') =>
  new Promise<boolean>((resolve) => {
    const socket = net.connect({ host, port: Number(port) });

    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.once('error', () => {
      resolve(false);
    });
  });

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

const docsAlreadyRunning = await isPortOpen(docsPort);

if (docsAlreadyRunning) {
  console.log(`[dev] docs already running on http://127.0.0.1:${docsPort}/docs/`);
} else {
  start('docs', ['run', 'docs:dev']);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
