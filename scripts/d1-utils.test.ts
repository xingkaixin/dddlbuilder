import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildD1ExecuteArgs,
  getD1Flag,
  listMigrationFiles,
  migrationDir,
  resolveD1Mode,
} from './d1-utils';

describe('d1-utils', () => {
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
      'x',
      'wrangler',
      'd1',
      'execute',
      'USER_DB',
      '--local',
      '--file',
      '/tmp/test.sql',
    ]);
  });

  it('lists sorted migration files only', () => {
    const files = listMigrationFiles(migrationDir);
    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toBe(path.join(migrationDir, '0001_user_system_init.sql'));
  });
});
