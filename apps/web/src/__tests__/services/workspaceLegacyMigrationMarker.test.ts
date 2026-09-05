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

  it('线上已有用户默认视为未完成，第一次启动仍要迁移', () => {
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(false);
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

  it('迁移中途失败（没跑到 complete）不应标记完成', () => {
    beginLegacyWorkspaceMigration(scope);

    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(false);
  });

  it('未 begin 就 complete 不应标记完成', () => {
    completeLegacyWorkspaceMigration(scope, 'running:never-issued');

    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(false);
  });

  it('localStorage 写入失败时应降级为未完成而不是抛出', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    let token = '';
    expect(() => {
      token = beginLegacyWorkspaceMigration(scope);
    }).not.toThrow();
    expect(() => completeLegacyWorkspaceMigration(scope, token)).not.toThrow();
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(false);
  });

  it('localStorage 读取失败时应降级为未完成而不是抛出', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => isLegacyWorkspaceMigrationCompleted(scope)).not.toThrow();
    expect(isLegacyWorkspaceMigrationCompleted(scope)).toBe(false);
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
