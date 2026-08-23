import { describe, expect, it } from 'vitest';
import { creditQueryKeys } from '@/queries/credits';
import { workspaceQueryKeys } from '@/queries/workspaces';
import { workspaceMigrationQueryKeys } from '@/queries/workspaceMigration';

describe('user-scoped query keys', () => {
  it('isolates credit and workspace resources by user', () => {
    expect(creditQueryKeys.balance('user-1')).not.toEqual(creditQueryKeys.balance('user-2'));
    expect(workspaceQueryKeys.current('user-1')).not.toEqual(workspaceQueryKeys.current('user-2'));
    expect(workspaceMigrationQueryKeys.proposal('user-1', 'ws-1')).not.toEqual(
      workspaceMigrationQueryKeys.proposal('user-2', 'ws-1'),
    );
  });
});
