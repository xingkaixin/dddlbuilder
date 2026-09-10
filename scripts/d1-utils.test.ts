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
  resetDatabase,
  resolveD1Mode,
  runD1Execute,
  runPendingMigrations,
  verifyRequiredD1Tables,
} from './d1-utils';

type SpawnResult = ReturnType<typeof spawnSync>;

const spawnResult = (overrides: Partial<SpawnResult> = {}): SpawnResult => ({
  pid: 0,
  output: [],
  stdout: '',
  stderr: '',
  status: 0,
  signal: null,
  ...overrides,
});

// oxlint-disable-next-line anti-slop/no-module-mocking -- child_process is the external Wrangler seam under test.
vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

describe('d1-utils', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // SAFETY: The test replaces process.exit with a non-returning no-op while asserting error paths.
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
    vi.mocked(spawnSync).mockReturnValue(spawnResult());
    runD1Execute('local', { command: 'SELECT 1' });
    expect(spawnSync).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining(['d1', 'execute', 'USER_DB']),
      expect.objectContaining({ stdio: 'inherit' }),
    );
  });

  it('exits when d1 execute fails', () => {
    vi.mocked(spawnSync).mockReturnValue(spawnResult({ status: 1 }));
    runD1Execute('local', { command: 'SELECT 1' });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('refuses to guess a baseline for an existing database', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [] }]),
        }),
      )
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [{ name: 'user' }] }]),
        }),
      )
      .mockReturnValue(spawnResult());

    expect(() => runPendingMigrations('local')).toThrow('迁移账本为空');

    const fileArgs = vi
      .mocked(spawnSync)
      .mock.calls.map((call) => call[1])
      .filter((args): args is string[] => Array.isArray(args) && args.includes('--file'));

    expect(fileArgs).toHaveLength(0);
  });

  it('records only an explicitly selected baseline range', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [] }]),
        }),
      )
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [{ name: 'users' }] }]),
        }),
      )
      .mockReturnValue(spawnResult());

    baselineExistingMigrations('local', '0002_better_auth_hard_cut.sql');

    const commands = vi
      .mocked(spawnSync)
      .mock.calls.map((call) => call[1])
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
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [{ name: '0001_user_system_init.sql' }] }]),
        }),
      );

    expect(() => baselineExistingMigrations('local', '0001_user_system_init.sql')).toThrow(
      '迁移账本不为空',
    );
  });

  it('rejects baselining a database without an existing app schema', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [] }]),
        }),
      )
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [] }]),
        }),
      );

    expect(() => baselineExistingMigrations('local', '0001_user_system_init.sql')).toThrow(
      '未检测到既有业务表',
    );
  });

  it('rejects an unknown baseline endpoint', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [] }]),
        }),
      )
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [{ name: 'users' }] }]),
        }),
      );

    expect(() => baselineExistingMigrations('local', '9999_unknown.sql')).toThrow('未知迁移');
  });

  it('applies every migration for a fresh database', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [] }]),
        }),
      )
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [] }]),
        }),
      )
      .mockReturnValue(spawnResult());

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
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([{ results: [{ name: firstMigration }] }]),
        }),
      )
      .mockReturnValue(spawnResult());

    runPendingMigrations('local');

    const fileCalls = vi
      .mocked(spawnSync)
      .mock.calls.map((call) => call[1])
      .filter((args) => Array.isArray(args) && args.includes('--file'));
    expect(fileCalls).toHaveLength(listMigrationFiles().length - 1);
    expect(fileCalls.some((args) => args?.includes(listMigrationFiles()[0]) === true)).toBe(false);
  });

  it('drops triggers before tables and preserves reverse creation order', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(
        spawnResult({
          status: 0,
          stdout: JSON.stringify([
            {
              results: [
                { type: 'table', name: 'child' },
                { type: 'trigger', name: 'parent_insert' },
                { type: 'table', name: 'parent' },
              ],
            },
          ]),
        }),
      )
      .mockReturnValue(spawnResult());

    resetDatabase('local');

    const commands = vi
      .mocked(spawnSync)
      .mock.calls.flatMap(([, args]) =>
        Array.isArray(args) ? [args[args.indexOf('--command') + 1]] : [],
      );
    expect(commands[0]).toContain("name NOT LIKE 'sqlite_%'");
    expect(commands[0]).toContain("name NOT LIKE '_cf_%'");
    expect(commands[0]).toContain('ORDER BY rowid DESC');
    expect(commands.slice(1)).toEqual([
      'DROP TRIGGER IF EXISTS "parent_insert"',
      'DROP TABLE IF EXISTS "child"',
      'DROP TABLE IF EXISTS "parent"',
    ]);
  });

  it('does not issue drop statements for an empty database', () => {
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({
        status: 0,
        stdout: JSON.stringify([{ results: [] }]),
      }),
    );

    resetDatabase('local');

    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it.each([1, null])('stops a reset when schema inspection fails (%s)', (status) => {
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({
        status,
        stderr: 'D1 inspection failed\n',
      }),
    );
    vi.mocked(process.exit).mockImplementationOnce(() => {
      throw new Error('process exited');
    });

    expect(() => resetDatabase('local')).toThrow('process exited');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('verifies all required runtime tables', () => {
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({
        status: 0,
        stdout: JSON.stringify([{ results: [{ name: 'user' }, { name: 'session' }] }]),
      }),
    );

    expect(() => verifyRequiredD1Tables('remote', ['user', 'session'])).not.toThrow();
  });

  it('rejects a database with missing runtime tables', () => {
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({
        status: 0,
        stdout: JSON.stringify([{ results: [{ name: 'user' }] }]),
      }),
    );

    expect(() => verifyRequiredD1Tables('remote', ['user', 'session'])).toThrow(
      'D1 缺少运行时必需表：session',
    );
  });

  it('stops migrations when a D1 ledger row is malformed', () => {
    vi.mocked(spawnSync)
      .mockReturnValueOnce(spawnResult())
      .mockReturnValueOnce(
        spawnResult({
          stdout: JSON.stringify([{ results: [{ invalid: true }] }]),
        }),
      )
      .mockReturnValue(spawnResult());

    expect(() => runPendingMigrations('local')).toThrow('D1 JSON row is missing a string name');
    expect(vi.mocked(spawnSync).mock.calls).toHaveLength(2);
  });

  it('stops reset when a D1 schema row is malformed', () => {
    vi.mocked(spawnSync).mockReturnValue(
      spawnResult({
        stdout: JSON.stringify([{ results: [{ type: 'table' }] }]),
      }),
    );

    expect(() => resetDatabase('local')).toThrow('D1 JSON row is missing string type/name');
    expect(vi.mocked(spawnSync).mock.calls).toHaveLength(1);
  });
});
