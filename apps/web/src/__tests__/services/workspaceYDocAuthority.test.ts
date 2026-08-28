import { describe, expect, it } from 'vitest';
import { isWorkspaceWriteTargetPending } from '@/services/workspaceYDocAuthority';

describe('workspaceYDocAuthority', () => {
  it('treats every signed-in state without a loaded Y.Doc as a pending write target', () => {
    expect(
      isWorkspaceWriteTargetPending({ authStatus: 'signed_out', userId: null, localSynced: false }),
    ).toBe(false);
    expect(
      isWorkspaceWriteTargetPending({ authStatus: 'loading', userId: null, localSynced: false }),
    ).toBe(true);
    expect(
      isWorkspaceWriteTargetPending({
        authStatus: 'signed_in',
        userId: 'user-1',
        localSynced: false,
      }),
    ).toBe(true);
    // refreshSession 期间 status 退回 loading，userId 保留，仍然是待定的写入目标
    expect(
      isWorkspaceWriteTargetPending({
        authStatus: 'loading',
        userId: 'user-1',
        localSynced: false,
      }),
    ).toBe(true);
    expect(
      isWorkspaceWriteTargetPending({
        authStatus: 'signed_in',
        userId: 'user-1',
        localSynced: true,
      }),
    ).toBe(false);
  });
});
