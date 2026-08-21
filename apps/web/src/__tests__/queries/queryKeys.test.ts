import { describe, expect, it } from 'vitest';
import { creditQueryKeys } from '@/queries/credits';
import { workspaceQueryKeys } from '@/queries/workspaces';

describe('user-scoped query keys', () => {
  it('isolates credit and workspace resources by user', () => {
    expect(creditQueryKeys.balance('user-1')).not.toEqual(creditQueryKeys.balance('user-2'));
    expect(workspaceQueryKeys.list('user-1')).not.toEqual(workspaceQueryKeys.list('user-2'));
  });
});
