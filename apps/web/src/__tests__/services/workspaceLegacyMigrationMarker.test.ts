import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupMemoryLocalStorage } from '@/__tests__/utils/memoryLocalStorage';
import {
  beginLegacyWorkspaceMigration,
  completeLegacyWorkspaceMigration,
  isLegacyWorkspaceMigrationCompleted,
} from '@/services/workspaceLegacyMigrationMarker';

const scope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-1' };
const otherWorkspaceScope = { kind: 'user' as const, userId: 'user-1', workspaceId: 'ws-2' };

describe('workspaceLegacyMigrationMarker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMemoryLocalStorage();
  });

  it('完整跑完一次后应标记完成，且只作用于该 workspace', () => {
    const token = beginLegacyWorkspaceMigration(scope);
    completeLegacyWorkspaceMigration(scope, token);

    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(true);
    expect(isLegacyWorkspaceMigrationCompleted(otherWorkspaceScope)).toBe(false);
    expect(
      isLegacyWorkspaceMigrationCompleted({
        kind: 'user',
        userId: 'user-2',
        workspaceId: 'ws-1',
      }),
    ).toBe(false);
  });

  it('另一次运行抢先开跑后，上一次运行不应认领完成标记', () => {
    const first = beginLegacyWorkspaceMigration(scope);
    const second = beginLegacyWorkspaceMigration(scope);
    expect(second).not.toBe(first);

    completeLegacyWorkspaceMigration(scope, first);
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(false);

    completeLegacyWorkspaceMigration(scope, second);
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(true);
  });
});
