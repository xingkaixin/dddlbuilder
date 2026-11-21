import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceScope } from '@ddlbuilder/shared-types/workspace';

type MockBootstrap = {
  globalDraft: unknown | null;
  drafts: Array<{ draftId: string; record: unknown }>;
  session: unknown | null;
  savedTable: unknown | null;
};

const createBootstrapMock = async (options?: {
  readImpl?: (scope?: WorkspaceScope) => Promise<MockBootstrap>;
  migrateImpl?: () => Promise<void>;
}) => {
  vi.resetModules();

  const readWorkspaceBootstrap = vi.fn(
    options?.readImpl ??
      (async () => ({ globalDraft: null, drafts: [], session: null, savedTable: null })),
  );
  const migrateLegacyWorkspaceFromLocalStorage = vi.fn(
    options?.migrateImpl ?? (async () => undefined),
  );

  // oxlint-disable-next-line anti-slop/no-module-mocking -- replace bootstrap storage reads to control legacy migration side effects.
  vi.doMock('@/utils/workspaceStateDb', () => ({
    readWorkspaceBootstrap,
    migrateLegacyWorkspaceFromLocalStorage,
  }));

  const mod = await import('@/hooks/workspacePersistence/bootstrap');

  return {
    getWorkspaceBootstrap: mod.getWorkspaceBootstrap,
    readWorkspaceBootstrap,
    migrateLegacyWorkspaceFromLocalStorage,
  };
};

describe('workspacePersistence/bootstrap', () => {
  it('首读命中时应直接返回并跳过迁移', async () => {
    const {
      getWorkspaceBootstrap,
      readWorkspaceBootstrap,
      migrateLegacyWorkspaceFromLocalStorage,
    } = await createBootstrapMock({
      readImpl: async () => ({
        globalDraft: { state: { tableName: 'users' }, updatedAt: 1 },
        drafts: [],
        session: null,
        savedTable: null,
      }),
    });

    const result = await getWorkspaceBootstrap();

    expect(result.globalDraft).toEqual({
      state: { tableName: 'users' },
      updatedAt: 1,
    });
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(1);
    expect(migrateLegacyWorkspaceFromLocalStorage).not.toHaveBeenCalled();
  });

  it('legacy 迁移失败时应向上抛出错误并允许重试', async () => {
    let migrated = false;
    let attempts = 0;

    const {
      getWorkspaceBootstrap,
      readWorkspaceBootstrap,
      migrateLegacyWorkspaceFromLocalStorage,
    } = await createBootstrapMock({
      readImpl: async () =>
        migrated
          ? {
              globalDraft: { state: { tableName: 'migrated' }, updatedAt: 2 },
              drafts: [],
              session: null,
              savedTable: null,
            }
          : { globalDraft: null, drafts: [], session: null, savedTable: null },
      migrateImpl: async () => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error('migration write failed');
        }

        migrated = true;
      },
    });

    await expect(getWorkspaceBootstrap()).rejects.toThrow('migration write failed');
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(1);
    expect(migrateLegacyWorkspaceFromLocalStorage).toHaveBeenCalledTimes(1);

    const recovered = await getWorkspaceBootstrap();

    expect(recovered.globalDraft).toEqual({
      state: { tableName: 'migrated' },
      updatedAt: 2,
    });
    expect(migrateLegacyWorkspaceFromLocalStorage).toHaveBeenCalledTimes(2);
    expect(readWorkspaceBootstrap).toHaveBeenCalledTimes(3);
  });
});
