import { fork } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { it, expect } from 'vitest';

it.each(['explain', 'review'])(
  'recovers a SIGKILLed %s generation and accounts both calls',
  async (scenario) => {
    const directory = mkdtempSync(join(tmpdir(), 'ddl-ai-recovery-'));

    const run = (mode: string) =>
      fork(
        fileURLToPath(new URL('../helpers/aiCrashChild.ts', import.meta.url)),
        [directory, mode, scenario],
        {
          execArgv: ['--import', import.meta.resolve('tsx')],
          stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
        },
      );
    const first = run('crash');
    let second: ReturnType<typeof run> | undefined;

    try {
      await new Promise<void>((resolve, reject) => {
        first.once('message', () => resolve());
        first.once('error', reject);
        first.once('exit', (code) => reject(new Error(`Crash child exited early: ${code}`)));
        first.stderr?.on('data', (data) => {
          if (String(data).includes('Error')) reject(new Error(String(data)));
        });
      });
      const killed = new Promise<void>((resolve) => first.once('exit', () => resolve()));
      first.kill('SIGKILL');
      await killed;
      second = run('resume');
      const result = await new Promise((resolve) => second?.once('message', resolve));

      if (scenario === 'review')
        expect(result).toMatchObject({
          suppliedProjection: true,
          snapshot: { suggestions: [expect.objectContaining({ id: 'stable-review-card' })] },
        });
      expect(result).toMatchObject({
        type: 'completed',
        snapshot: {
          operationId: 'operation',
          conversationId: 'conversation',
          status: 'succeeded',
          text:
            scenario === 'explain'
              ? 'Recovered answer'
              : expect.stringContaining('stable-review-card'),
          accountingPending: false,
        },
        calls: { count: 2 },
        balance: expect.any(Number),
      });
    } finally {
      first.kill('SIGKILL');
      second?.kill('SIGKILL');
      rmSync(directory, { recursive: true, force: true });
    }
  },
  20_000,
);
