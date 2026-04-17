import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildD1ExecuteArgs,
  getD1Flag,
  listMigrationFiles,
  migrationDir,
  resolveD1Mode,
  runD1Execute,
} from './d1-utils';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('d1-utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });
  it('defaults to local mode', () => {
    expect(resolveD1Mode([])).toBe('local');
    expect(getD1Flag('local')).toBe('--local');
  });

  it('switches to remote mode when requested', () => {
    expect(resolveD1Mode(['--remote'])).toBe('remote');
    expect(getD1Flag('remote')).toBe('--remote');
  });

  it('builds wrangler execute args from sql file', () => {
    expect(buildD1ExecuteArgs('local', { file: '/tmp/test.sql' })).toEqual([
      'exec',
      'wrangler',
      '--config',
      'apps/worker/wrangler.toml',
      'd1',
      'execute',
      'USER_DB',
      '--local',
      '--persist-to',
      '.wrangler/state/dev',
      '--file',
      '/tmp/test.sql',
    ]);
  });

  it('lists sorted migration files only', () => {
    const files = listMigrationFiles(migrationDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toBe(path.join(migrationDir, '0001_user_system_init.sql'));
  });

  it('builds wrangler execute args from command only', () => {
    expect(buildD1ExecuteArgs('local', { command: 'SELECT 1' })).toEqual([
      'exec',
      'wrangler',
      '--config',
      'apps/worker/wrangler.toml',
      'd1',
      'execute',
      'USER_DB',
      '--local',
      '--persist-to',
      '.wrangler/state/dev',
      '--command',
      'SELECT 1',
    ]);
  });

  it('builds wrangler execute args with json flag', () => {
    expect(buildD1ExecuteArgs('local', { command: 'SELECT 1', json: true })).toEqual([
      'exec',
      'wrangler',
      '--config',
      'apps/worker/wrangler.toml',
      'd1',
      'execute',
      'USER_DB',
      '--local',
      '--persist-to',
      '.wrangler/state/dev',
      '--command',
      'SELECT 1',
      '--json',
    ]);
  });

  it('builds wrangler execute args for remote mode without persist-to', () => {
    expect(buildD1ExecuteArgs('remote', { file: '/tmp/test.sql' })).toEqual([
      'exec',
      'wrangler',
      '--config',
      'apps/worker/wrangler.toml',
      'd1',
      'execute',
      'USER_DB',
      '--remote',
      '--file',
      '/tmp/test.sql',
    ]);
  });

  it('throws error when neither file nor command is provided', () => {
    expect(() => buildD1ExecuteArgs('local', {})).toThrow('缺少 SQL 输入');
  });

  it('builds wrangler execute args with both file and command', () => {
    expect(
      buildD1ExecuteArgs('local', { file: '/tmp/test.sql', command: 'SELECT 1' }),
    ).toEqual([
      'exec',
      'wrangler',
      '--config',
      'apps/worker/wrangler.toml',
      'd1',
      'execute',
      'USER_DB',
      '--local',
      '--persist-to',
      '.wrangler/state/dev',
      '--file',
      '/tmp/test.sql',
      '--command',
      'SELECT 1',
    ]);
  });

  it('builds wrangler execute args for remote mode with command', () => {
    expect(buildD1ExecuteArgs('remote', { command: 'SELECT 1' })).toEqual([
      'exec',
      'wrangler',
      '--config',
      'apps/worker/wrangler.toml',
      'd1',
      'execute',
      'USER_DB',
      '--remote',
      '--command',
      'SELECT 1',
    ]);
  });

  it('runs d1 execute successfully', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);
    runD1Execute('local', { command: 'SELECT 1' });
    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining(['d1', 'execute', 'USER_DB']),
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('exits when d1 execute fails', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 1 } as ReturnType<typeof spawnSync>);
    runD1Execute('local', { command: 'SELECT 1' });
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
