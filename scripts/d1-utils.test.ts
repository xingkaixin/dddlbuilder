import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildD1ExecuteArgs,
  baselineExistingMigrations,
  getD1Flag,
  getWranglerConfigPath,
  listMigrationFiles,
  migrationDir,
  resolveD1Mode,
  runAllMigrations,
  runD1Execute,
  runPendingMigrations,
  verifyRequiredD1Tables,
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
    expect(getWranglerConfigPath('remote')).toBe('apps/worker/wrangler.deploy.toml');
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
      'apps/worker/wrangler.deploy.toml',
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
    expect(buildD1ExecuteArgs('local', { file: '/tmp/test.sql', command: 'SELECT 1' })).toEqual([
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
      'apps/worker/wrangler.deploy.toml',
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

  it('refuses to guess a baseline for an existing database', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [{ name: 'user' }] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    expect(() => runPendingMigrations('local')).toThrow('迁移账本为空');

    const fileArgs = (
      spawnSync as unknown as { mock: { calls: Array<[string, string[]]> } }
    ).mock.calls
      .map((call) => call[1])
      .filter((args): args is string[] => Array.isArray(args) && args.includes('--file'));

    expect(fileArgs).toHaveLength(0);
  });

  it('records only an explicitly selected baseline range', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [{ name: 'users' }] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    baselineExistingMigrations('local', '0002_better_auth_hard_cut.sql');

    const commands = (
      spawnSync as unknown as { mock: { calls: Array<[string, string[]]> } }
    ).mock.calls
      .map((call) => call[1])
      .filter((args): args is string[] => Array.isArray(args))
      .flatMap((args) => {
        const commandIndex = args.indexOf('--command');
        return commandIndex >= 0 ? [args[commandIndex + 1]] : [];
      })
      .filter((command) => command.startsWith('INSERT OR IGNORE'));

    expect(commands).toHaveLength(2);
    expect(commands[0]).toContain('0001_user_system_init.sql');
    expect(commands[1]).toContain('0002_better_auth_hard_cut.sql');
  });

  it('rejects baselining a non-empty migration ledger', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [{ name: '0001_user_system_init.sql' }] }]),
      } as ReturnType<typeof spawnSync>);

    expect(() => baselineExistingMigrations('local', '0001_user_system_init.sql')).toThrow(
      '迁移账本不为空',
    );
  });

  it('rejects baselining a database without an existing app schema', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      } as ReturnType<typeof spawnSync>);

    expect(() => baselineExistingMigrations('local', '0001_user_system_init.sql')).toThrow(
      '未检测到既有业务表',
    );
  });

  it('rejects an unknown baseline endpoint', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [{ name: 'users' }] }]),
      } as ReturnType<typeof spawnSync>);

    expect(() => baselineExistingMigrations('local', '9999_unknown.sql')).toThrow('未知迁移');
  });

  it('applies every migration for a fresh database', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    runPendingMigrations('local');

    const fileCalls = vi
      .mocked(spawnSync)
      .mock.calls.map((call) => call[1])
      .filter((args) => Array.isArray(args) && args.includes('--file'));
    expect(fileCalls).toHaveLength(listMigrationFiles().length);
  });

  it('skips migrations already recorded in the ledger', () => {
    const firstMigration = path.basename(listMigrationFiles()[0]);
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([{ results: [{ name: firstMigration }] }]),
      } as ReturnType<typeof spawnSync>)
      .mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    runPendingMigrations('local');

    const fileCalls = vi
      .mocked(spawnSync)
      .mock.calls.map((call) => call[1])
      .filter((args) => Array.isArray(args) && args.includes('--file'));
    expect(fileCalls).toHaveLength(listMigrationFiles().length - 1);
    expect(fileCalls.some((args) => args?.includes(listMigrationFiles()[0]) === true)).toBe(false);
  });

  it('runs all migrations without consulting the ledger', () => {
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as ReturnType<typeof spawnSync>);

    runAllMigrations('remote');

    expect(spawnSync).toHaveBeenCalledTimes(listMigrationFiles().length);
    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining(['--remote', '--file']),
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('verifies all required runtime tables', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify([{ results: [{ name: 'user' }, { name: 'session' }] }]),
    } as ReturnType<typeof spawnSync>);

    expect(() => verifyRequiredD1Tables('remote', ['user', 'session'])).not.toThrow();
  });

  it('rejects a database with missing runtime tables', () => {
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: JSON.stringify([{ results: [{ name: 'user' }] }]),
    } as ReturnType<typeof spawnSync>);

    expect(() => verifyRequiredD1Tables('remote', ['user', 'session'])).toThrow(
      'D1 缺少运行时必需表：session',
    );
  });
});
